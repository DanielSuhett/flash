import * as core from '@actions/core';
import { ActionConfig, PullRequestInfo } from '../types/index.js';
import { GitHubService } from '../github/github-service.js';
import { LlmService } from '../modules/llm/llm.service.js';
import { PullRequestSummaryResponse } from '../modules/llm/entities/index.js';
import { LlmRepository } from '../modules/llm/llm.repository.js';

export class WorkflowService {
  private config: ActionConfig;
  private githubService: GitHubService;
  private llmService: LlmService;

  constructor(config: ActionConfig) {
    this.config = config;
    this.githubService = new GitHubService(config.githubToken);
    this.llmService = new LlmService(
      new LlmRepository({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        maxTokens: config.llm.maxTokens,
      })
    );
  }

  async processReview(owner: string, repo: string, prNumber: number): Promise<void> {
    try {
      core.info(`Starting review for PR #${prNumber} in ${owner}/${repo}`);
      const pullRequestInfo = await this.githubService.getPullRequestInfo(owner, repo, prNumber);
      core.info(`Analyzing PR: ${pullRequestInfo.title}`);

      const prWithContents = await this.githubService.loadFileContents(pullRequestInfo);
    

      core.info('Posting summary comment...');
      await this.postSummaryComment(prWithContents, summaryResult);

      core.info('Code review completed successfully');
    } catch (error) {
      core.error(`Error during review process: ${error}`);
      throw error;
    }
  }

  private async postSummaryComment(
    pullRequest: PullRequestInfo,
    summaryResult: PullRequestSummaryResponse
  ): Promise<void> {
    const comment = this.buildSummaryComment(summaryResult);

    await this.githubService.createReview(
      pullRequest.owner,
      pullRequest.repo,
      pullRequest.prNumber,
      pullRequest.headSha,
      comment
    );
  }

  private buildSummaryComment(summaryResult: PullRequestSummaryResponse): string {
    const header = '# ✨ Flash Code Review';
    const summary = `\n\n${summaryResult.summary}`;

    return `${header}${summary}`;
  }
}
