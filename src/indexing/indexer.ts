import * as core from '@actions/core';
import { IndexedCodebase, IndexedFile, Declaration } from '../types/index.js';
import { GitHubService } from '../github/github-service.js';

export class CodeIndexer {
  private githubService: GitHubService;

  constructor(githubToken: string) {
    this.githubService = new GitHubService(githubToken);
  }

  async indexCodebase(
    owner: string,
    repo: string,
    branch: string,
    prioritizedFiles: string[] = []
  ): Promise<IndexedCodebase> {
    const files: IndexedFile[] = [];
    const dependencies: Record<string, string[]> = {};
    const imports: Record<string, string[]> = {};

    const tsFiles = await this.getTypeScriptFiles(owner, repo, branch, prioritizedFiles, imports);

    for (let i = 0; i < tsFiles.length; i += 10) {
      const batch = tsFiles.slice(i, i + 10);
      const contents = await Promise.all(
        batch.map((file) => this.githubService.getFileContent(owner, repo, file, branch))
      );

      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const content = contents[j];

        if (content) {
          const declarations = this.extractDeclarations(content);
          const fileImports = this.extractImports(content);

          files.push({
            path: file,
            content,
            declarations,
          });

          imports[file] = fileImports;

          for (const imp of fileImports) {
            if (!dependencies[imp]) {
              dependencies[imp] = [];
            }
            dependencies[imp].push(file);
          }
        }
      }
    }

    if (files.length === 0) {
      core.warning(
        'No TypeScript files were successfully processed. This might affect the quality of the review.'
      );
    }

    return { files, dependencies, imports };
  }

  private async getTypeScriptFiles(
    owner: string,
    repo: string,
    branch: string,
    prioritizedFiles: string[],
    imports: Record<string, string[]>
  ): Promise<string[]> {
    const files: string[] = [];
    const baseDirs = ['', 'src', 'lib', 'packages', 'test', 'tests', '__tests__'];

    const processDirectory = async (dir: string): Promise<void> => {
      try {
        const dirFiles = await this.githubService.getRepoContent(owner, repo, dir, branch);

        if (dirFiles && dirFiles.length > 0) {
          for (const item of dirFiles) {
            if (item.type === 'dir') {
              await processDirectory(item.path);
            } else if (item.type === 'file') {
              const tsFiles = this.filterTypeScriptFiles([item.path]);

              if (tsFiles.length > 0) {
                files.push(...tsFiles);
              }
            }
          }
        }
      } catch (error) {
        core.debug(`Directory ${dir || 'root'} not found or error accessing: ${error}`);
      }
    };

    for (const dir of baseDirs) {
      await processDirectory(dir);
    }

    if (files.length === 0) {
      core.warning(
        'No TypeScript files found in the repository. This might affect the quality of the review.'
      );

      return [];
    }

    const prioritized = files.filter((file) =>
      prioritizedFiles.some((prioritized) => file.includes(prioritized))
    );

    const relatedFiles = await this.findRelatedFiles(owner, repo, branch, prioritized, imports);

    const remaining = files
      .filter((file) => !prioritized.includes(file) && !relatedFiles.includes(file))
      .slice(0, 100);

    const allFiles = [...new Set([...prioritized, ...relatedFiles, ...remaining])];

    if (allFiles.length === 0) {
      throw new Error('No valid TypeScript files found after processing');
    }

    return allFiles;
  }

  private filterTypeScriptFiles(files: string[]): string[] {
    return files.filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.d.ts') &&
        !file.includes('node_modules') &&
        !file.includes('dist')
    );
  }

  private async findRelatedFiles(
    owner: string,
    repo: string,
    branch: string,
    files: string[],
    imports: Record<string, string[]>
  ): Promise<string[]> {
    const related = new Set<string>();

    for (const file of files) {
      const fileImports = imports[file] || [];

      for (const imp of fileImports) {
        if (!related.has(imp)) {
          related.add(imp);
        }
      }
    }

    return Array.from(related);
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;

    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      if (!importPath.startsWith('node_modules')) {
        imports.push(this.resolveImportPath(importPath));
      }
    }

    return imports;
  }

  private resolveImportPath(importPath: string): string {
    if (importPath.startsWith('.')) {
      return importPath;
    }

    const parts = importPath.split('/');

    if (parts[0].startsWith('@')) {
      return parts.slice(0, 2).join('/');
    }

    return parts[0];
  }

  private extractDeclarations(content: string): Declaration[] {
    const declarations: Declaration[] = [];
    const declarationRegex =
      /(?:export\s+)?(?:class|interface|type|enum|function|const|var|namespace)\s+(\w+)/g;

    let match;

    while ((match = declarationRegex.exec(content)) !== null) {
      const name = match[1];
      const type = this.getDeclarationType(match[0]);
      const exported = match[0].includes('export');

      const location = this.findDeclarationLocation(content, match.index);

      declarations.push({
        type,
        name,
        location,
        exported,
        dependencies: this.findDependencies(content, location),
      });
    }

    return declarations;
  }

  private getDeclarationType(declaration: string): Declaration['type'] {
    if (declaration.includes('class')) return 'class';
    if (declaration.includes('interface')) return 'interface';
    if (declaration.includes('type')) return 'type';
    if (declaration.includes('enum')) return 'enum';
    if (declaration.includes('function')) return 'function';
    if (declaration.includes('const')) return 'const';
    if (declaration.includes('var')) return 'var';
    if (declaration.includes('namespace')) return 'namespace';

    return 'type';
  }

  private findDeclarationLocation(
    content: string,
    startIndex: number
  ): { startLine: number; endLine: number } {
    const lines = content.split('\n');
    let startLine = 1;
    let endLine = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const lineStart = content.indexOf(lines[i]);

      if (lineStart <= startIndex) {
        startLine = i + 1;
      }
    }

    let braceCount = 0;
    let inComment = false;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('//')) continue;

      if (line.includes('/*')) inComment = true;
      if (line.includes('*/')) inComment = false;
      if (inComment) continue;

      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      if (braceCount === 0 && !line.includes('{')) {
        endLine = i + 1;
        break;
      }
    }

    return { startLine, endLine };
  }

  private findDependencies(
    content: string,
    location: { startLine: number; endLine: number }
  ): string[] {
    const dependencies = new Set<string>();
    const lines = content.split('\n').slice(location.startLine - 1, location.endLine);

    for (const line of lines) {
      const importMatch = line.match(
        /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/
      );

      if (importMatch) {
        dependencies.add(this.resolveImportPath(importMatch[1]));
      }
    }

    return Array.from(dependencies);
  }
}
