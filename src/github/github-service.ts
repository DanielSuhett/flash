import type { RestEndpointMethodTypes } from '@octokit/rest';
import { PullRequestInfo, FileChange } from '../types/index.js';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import * as core from '@actions/core';
import {
  RATE_LIMIT_CONFIG,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY,
  MAX_RETRY_DELAY,
} from './rate-limit-config.js';

const throttledOctokit = Octokit.plugin(throttling);

export class GitHubService {
  private octokit: InstanceType<typeof throttledOctokit>;

  constructor(token: string) {
    this.octokit = new throttledOctokit({
      auth: token,
      userAgent: 'rreviewer',
      throttle: RATE_LIMIT_CONFIG,
    });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = INITIAL_RETRY_DELAY;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, MAX_RETRY_DELAY);
        }
      }
    }

    throw lastError;
  }

  async getPullRequestInfo(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo> {
    return this.withRetry(async () => {
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
        body: pr.body,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        author: pr.user?.login || '',
        files: fileChanges,
      };
    });
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    return this.withRetry(async () => {
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
    });
  }

  async getRepoContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<RepoItem[]> {
    return this.withRetry(async () => {
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
    });
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
    return this.withRetry(async () => {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
    });
  }

  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    commit_id: string,
    body: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  ): Promise<void> {
    return this.withRetry(async () => {
      await this.octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id,
        body,
        event,
      });
    });
  }

  async approvePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
    return this.withRetry(async () => {
      await this.octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event: 'APPROVE',
        body: 'Automatically approved based on code review results.',
      });
    });
  }

  async mergePullRequest(owner: string, repo: string, prNumber: number): Promise<boolean> {
    return this.withRetry(async () => {
      try {
        await this.octokit.pulls.merge({
          owner,
          repo,
          pull_number: prNumber,
          merge_method: 'merge',
        });

        return true;
      } catch (error) {
        await this.createComment(
          owner,
          repo,
          prNumber,
          '⚠️ PR was approved but could not be automatically merged. Please resolve any conflicts and merge manually.'
        );

        return false;
      }
    });
  }
}

interface RepoItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}
