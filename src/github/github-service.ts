import type { RestEndpointMethodTypes } from '@octokit/rest';
import { PullRequestInfo, FileChange, MarkdownCodebase } from '../types/index.js';
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';
import ignore from 'ignore';

export class GitHubService {
  private octokit: Octokit;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_FILE_SIZE_PER_FILE = 100 * 1024; // 100KB
  private readonly DEFAULT_IGNORES = [
    'node_modules',
    'dist',
    '.git',
    '*.lock',
    '*.log',
    '.DS_Store',
    'coverage',
    'build',
    'test',
    'tests',
    '__tests__',
    '__mocks__',
    '*.test.*',
    '*.spec.*',
    '*.min.*',
    '*.map',
    'public',
    'assets',
    'images',
    'img',
    'docs',
    '.next',
    '.cache',
    '.husky',
    '.github',
    'vendor',
    'third-party'
  ];

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'rreviewer',
    });
  }

  async getPullRequestInfo(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: files } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const fileChanges: FileChange[] = files.map((file) => ({
      filename: file.filename,
      status: file.status as 'added' | 'modified' | 'removed',
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    }));

    return {
      owner,
      repo,
      prNumber,
      title: pr.title,
      body: pr.body || '',
      description: pr.body || '',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      headSha: pr.head.sha,
      files: fileChanges,
    };
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const data =
        response.data as RestEndpointMethodTypes['repos']['getContent']['response']['data'];

      if ('content' in data && !Array.isArray(data)) {
        const content = Buffer.from(data.content, 'base64').toString('utf8');

        return content;
      }

      return null;
    } catch (error) {
      core.warning(
        `Failed to fetch content for ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      return null;
    }
  }

  async getRepoContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<RepoItem[]> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const data = response.data;

      if (Array.isArray(data)) {
        return data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type as 'file' | 'dir',
          sha: item.sha,
        }));
      } else if (data.type === 'file') {
        return [
          {
            name: data.name,
            path: data.path,
            type: 'file',
            sha: data.sha,
          },
        ];
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  async loadFileContents(pullRequestInfo: PullRequestInfo): Promise<PullRequestInfo> {
    const { owner, repo, baseBranch, headBranch, files } = pullRequestInfo;

    const filesWithContent = await Promise.all(
      files.map(async (file) => {
        if (file.status !== 'removed') {
          const branchToUse = file.status === 'added' ? headBranch : baseBranch;
          let content = await this.getFileContent(owner, repo, file.filename, branchToUse);
          
          if (!content && file.status === 'modified') {
            content = await this.getFileContent(owner, repo, file.filename, baseBranch);
          }

          return {
            ...file,
            contents: content || undefined,
          };
        }

        return file;
      })
    );

    return {
      ...pullRequestInfo,
      files: filesWithContent,
    };
  }

  async createComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }

  private calculateDiffPosition(patch: string | undefined, targetLine: number): number | null {
    if (!patch) {
      return null;
    }

    const lines = patch.split('\n');
    let currentLine = 0;
    let diffPosition = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

        if (match) {
          currentLine = parseInt(match[1], 10) - 1;
        }
        diffPosition++;
        continue;
      }

      if (!line.startsWith('-')) {
        currentLine++;
      }
      diffPosition++;

      if (currentLine === targetLine) {
        return diffPosition;
      }
    }

    return null;
  }

  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    commit_id: string,
    body: string,
    comments?: {
      path: string;
      position: number;
      body: string;
    }[]
  ): Promise<void> {
    const { data: files } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const filePatches = new Map(files.map((file) => [file.filename, file.patch]));

    const validComments = comments?.flatMap((comment) => {
      const patch = filePatches.get(comment.path);
      const position = this.calculateDiffPosition(patch, comment.position);

      if (position !== null) {
        return [
          {
            path: comment.path,
            position,
            body: comment.body,
          },
        ];
      }

      core.warning(
        `Skipping comment for ${comment.path}:${comment.position} - position not found in diff`
      );

      return [];
    });

    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    if (validComments && validComments.length > 0) {
      for (const comment of validComments) {
        await this.octokit.pulls.createReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          commit_id,
          path: comment.path,
          position: comment.position,
          body: comment.body,
        });
      }
    }
  }


  private async getRepoTree(
    owner: string,
    repo: string,
    ref: string
  ): Promise<{ path: string; type: string; url: string }[]> {
    try {
      const { data } = await this.octokit.git.getTree({
        owner,
        repo,
        tree_sha: ref,
        recursive: 'true'
      });

      return data.tree.map(item => ({
        path: item.path || '',
        type: item.type || 'blob',
        url: item.url || ''
      }));
    } catch (error) {
      core.warning(`Failed to get repo tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private isTextFile(filename: string): boolean {
    const textExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '.md',
      '.yml',
      '.yaml'
    ];
    const path = filename.toLowerCase();
    
    return textExtensions.some(ext => path.endsWith(ext)) && 
           !path.includes('.min.') && 
           !path.includes('.d.ts') &&
           !path.endsWith('.test.ts') &&
           !path.endsWith('.spec.ts');
  }

  private exceedsFileSizeLimit(content: string): boolean {
    return content.length > this.MAX_FILE_SIZE_PER_FILE;
  }

  private shouldIgnoreFile(path: string): boolean {
    const ignoreFilter = ignore.default().add(this.DEFAULT_IGNORES);
    return ignoreFilter.ignores(path) || path.split('/').some(part => part.startsWith('.'));
  }

  private removeWhitespace(content: string, filename: string): string {
    const whitespaceDependent = ['.md', '.yml', '.yaml'];
    if (whitespaceDependent.some(ext => filename.endsWith(ext))) {
      return content;
    }
    return content.replace(/\s+/g, ' ').trim();
  }

  async indexCodebaseAsMarkdown(
    owner: string,
    repo: string,
    ref: string,
    prioritizedFiles: string[] = []
  ): Promise<MarkdownCodebase> {
    let output = '';
    let includedFiles: string[] = [];
    let ignoredCount = 0;
    let binaryCount = 0;
    let totalSize = 0;
    let skippedDueToSize = 0;

    const files = await this.getRepoTree(owner, repo, ref);
    
    const filesToProcess = files.filter(f => prioritizedFiles.includes(f.path));

    for (const file of filesToProcess) {
      if (this.shouldIgnoreFile(file.path)) {
        ignoredCount++;
        continue;
      }

      if (file.type === 'blob' && this.isTextFile(file.path)) {
        try {
          const content = await this.getFileContent(owner, repo, file.path, ref);
          if (!content) continue;

          if (this.exceedsFileSizeLimit(content)) {
            skippedDueToSize++;
            core.debug(`Skipping ${file.path} due to size limit (${content.length} bytes)`);
            continue;
          }

          const relevantContent = this.extractRelevantFunctions(content);
          if (!relevantContent) continue;

          const processedContent = this.removeWhitespace(relevantContent, file.path);
          const extension = file.path.split('.').pop() || '';
          
          output += `# ${file.path}\n\n`;
          output += `\`\`\`${extension}\n`;
          output += processedContent;
          output += '\n\`\`\`\n\n';

          includedFiles.push(file.path);
          totalSize += processedContent.length;

          if (totalSize > this.MAX_FILE_SIZE) {
            core.warning('Maximum total size exceeded. Some files may be omitted.');
            break;
          }
        } catch (error) {
          core.warning(`Failed to process ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        binaryCount++;
      }
    }

    if (skippedDueToSize > 0) {
      core.info(`Skipped ${skippedDueToSize} files due to individual size limits`);
    }

    return {
      content: output,
      includedFiles,
      totalFiles: files.length,
      ignoredFiles: ignoredCount + skippedDueToSize,
      binaryFiles: binaryCount,
      tokenCount: Math.ceil(totalSize / 4)
    };
  }

  private extractRelevantFunctions(content: string): string | null {
    const functionRegex = /(?:export\s+)?(?:async\s+)?(?:function|const)\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]*?)?\s*{[^}]*}/gs;
    const classMethodRegex = /(?:public|private|protected|async)?\s*\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]*?)?\s*{[^}]*}/gs;
    
    const functions = [...content.matchAll(functionRegex)].map(m => m[0]);
    const methods = [...content.matchAll(classMethodRegex)].map(m => m[0]);
    
    const allFunctions = [...functions, ...methods];
    if (allFunctions.length === 0) return null;

    return allFunctions.join('\n\n');
  }
}

interface RepoItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}
