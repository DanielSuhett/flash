import type { RestEndpointMethodTypes } from '@octokit/rest';
import { PullRequestInfo, FileChange, MarkdownCodebase } from '../types/index.js';
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';
import ignore from 'ignore';

export class GitHubService {
  private octokit: Octokit;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly DEFAULT_IGNORES = [
    'node_modules',
    'dist',
    '.git',
    '*.lock',
    '*.log',
    '.DS_Store',
    'coverage',
    'build'
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
    const { owner, repo, baseBranch, files } = pullRequestInfo;

    const filesWithContent = await Promise.all(
      files.map(async (file) => {
        if (file.status !== 'removed') {
          const content = await this.getFileContent(owner, repo, file.filename, baseBranch);

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
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
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

    await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id,
      body,
      event,
      comments: validComments,
    });
  }

  async approvePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
    await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      event: 'APPROVE',
      body: 'Automatically approved based on code review results.',
    });
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
    const textExtensions = ['.ts', '.js', '.json', '.md', '.yml', '.yaml', '.txt', '.html', '.css', '.scss', '.jsx', '.tsx'];
    return textExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  private shouldIgnoreFile(path: string): boolean {
    const ignoreFilter = ignore.default().add(this.DEFAULT_IGNORES);
    return ignoreFilter.ignores(path);
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

    const files = await this.getRepoTree(owner, repo, ref);
    const sortedFiles = [...files].sort((a, b) => 
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' })
    );

    const prioritizedSet = new Set(prioritizedFiles);
    const prioritizedItems = sortedFiles.filter(f => prioritizedSet.has(f.path));
    const remainingItems = sortedFiles.filter(f => !prioritizedSet.has(f.path));
    const processOrder = [...prioritizedItems, ...remainingItems];

    for (const file of processOrder) {
      if (this.shouldIgnoreFile(file.path)) {
        ignoredCount++;
        continue;
      }

      if (file.type === 'blob') {
        if (this.isTextFile(file.path)) {
          try {
            const content = await this.getFileContent(owner, repo, file.path, ref);
            if (content) {
              const processedContent = this.removeWhitespace(content, file.path);
              const extension = file.path.split('.').pop() || '';
              
              output += `# ${file.path}\n\n`;
              output += `\`\`\`${extension}\n`;
              output += processedContent;
              output += '\n\`\`\`\n\n';

              includedFiles.push(file.path);
              totalSize += processedContent.length;
            }
          } catch (error) {
            core.warning(`Failed to process ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          output += `# ${file.path}\n\n`;
          output += `This is a binary file.\n\n`;
          binaryCount++;
        }
      }

      if (totalSize > this.MAX_FILE_SIZE) {
        core.warning('Maximum file size exceeded. Some files may be omitted.');
        break;
      }
    }

    return {
      content: output,
      includedFiles,
      totalFiles: files.length,
      ignoredFiles: ignoredCount,
      binaryFiles: binaryCount,
      tokenCount: Math.ceil(totalSize / 4)
    };
  }
}

interface RepoItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}
