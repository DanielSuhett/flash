import type { RestEndpointMethodTypes } from '@octokit/rest';
import { PullRequestInfo, FileChange } from '../types/index.js';
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';

export class GitHubService {
  private octokit: Octokit;

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
}

interface RepoItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}
