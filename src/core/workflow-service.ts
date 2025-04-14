import * as core from '@actions/core';
import { ActionConfig, PullRequestInfo, IndexedCodebase } from '../types/index.js';
import { GitHubService } from '../github/github-service.js';
import { CodeIndexer } from '../indexing/indexer.js';
import { LlmService } from '../modules/llm/llm.service.js';
import { CodeReviewResponse } from '../modules/llm/entities/index.js';
import { LlmRepository } from '../modules/llm/llm.repository.js';

export class WorkflowService {
  private config: ActionConfig;
  private githubService: GitHubService;
  private codeIndexer: CodeIndexer;
  private llmService: LlmService;

  constructor(config: ActionConfig) {
    this.config = config;
    this.githubService = new GitHubService(config.githubToken);
    this.codeIndexer = new CodeIndexer(config.githubToken);
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

      core.info(`Loaded content for ${prWithContents.files.length} changed files`);

      const changedFiles = pullRequestInfo.files.map((file) => file.filename);

      core.info('Indexing codebase structure...');

      const indexedCodebase = await this.codeIndexer.indexCodebase(
        owner,
        repo,
        pullRequestInfo.baseBranch,
        changedFiles
      );

      if (indexedCodebase.files.length === 0) {
        throw new Error('No TypeScript files found in the repository');
      }

      core.info('Performing code review...');
      const appType = this.determineAppType(indexedCodebase);
      const reviewResult = await this.llmService.reviewCode(indexedCodebase, prWithContents, appType);

      core.info('Posting review results...');
      await this.postReviewComment(prWithContents, reviewResult);

      core.info('Code review completed successfully');
    } catch (error) {
      core.error(`Error during review process: ${error}`);
      throw error;
    }
  }

  private determineAppType(codebase: IndexedCodebase): 'frontend' | 'backend' | 'fullstack' {
    const hasReactFiles = codebase.files.some(
      (file) => file.path.includes('components') || file.path.includes('pages') || file.path.endsWith('.tsx')
    );
    const hasServerFiles = codebase.files.some(
      (file) =>
        file.path.includes('controllers') || file.path.includes('services') || file.path.includes('repositories')
    );

    if (hasReactFiles && hasServerFiles) return 'fullstack';
    if (hasReactFiles) return 'frontend';

    return 'backend';
  }

  private shouldAutoApprove(reviewResult: CodeReviewResponse): boolean {
    return reviewResult.approvalRecommended;
  }

  private async postReviewComment(pullRequest: PullRequestInfo, reviewResult: CodeReviewResponse): Promise<void> {
    let comment = this.buildReviewComment(reviewResult);

    if (this.config.llm.outputLanguage && this.config.llm.outputLanguage !== 'en') {
      comment = await this.llmService.translateText(comment, this.config.llm.outputLanguage);
    }

    const event = reviewResult.approvalRecommended ? 'APPROVE' : 'REQUEST_CHANGES';

    await this.githubService.createReview(
      pullRequest.owner,
      pullRequest.repo,
      pullRequest.prNumber,
      pullRequest.headSha,
      comment,
      event
    );
  }

  private buildReviewComment(reviewResult: CodeReviewResponse): string {
    const summary = this.buildSummarySection(reviewResult);
    const suggestions = this.buildSuggestionsSection(reviewResult);
    const issues = this.buildIssuesSection(reviewResult);
    const approval = this.buildApprovalSection(reviewResult);
    const tokenUsage = this.buildTokenUsageSection(reviewResult);
    const watermark = '\n\n---\n*Reviewed by rreviewer* 🤖';

    return `${summary}\n\n${suggestions}\n\n${approval}\n\n${issues}\n\n${tokenUsage}${watermark}`;
  }

  private buildSummarySection(reviewResult: CodeReviewResponse): string {
    return `# Code Review Summary\n\n${reviewResult.summary}\n\n`;
  }

  private buildSuggestionsSection(reviewResult: CodeReviewResponse): string {
    const sections = [];

    if (reviewResult.suggestions.critical.length > 0) {
      sections.push(
        '## Critical Issues 🚨\n' +
          reviewResult.suggestions.critical
            .map(
              (suggestion) =>
                `- **${suggestion.category}** (${suggestion.file}:${suggestion.location}):\n  ${suggestion.description}`
            )
            .join('\n')
      );
    }

    if (reviewResult.suggestions.important.length > 0) {
      sections.push(
        '## Important Improvements ⚠️\n' +
          reviewResult.suggestions.important
            .map(
              (suggestion) =>
                `- **${suggestion.category}** (${suggestion.file}:${suggestion.location}):\n  ${suggestion.description}`
            )
            .join('\n')
      );
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  }

  private buildIssuesSection(reviewResult: CodeReviewResponse): string {
    const sections = [];

    if (reviewResult.issues.security.length > 0) {
      sections.push(
        `## Security Issues\n${reviewResult.issues.security.map((issue: string) => `- ${issue}`).join('\n')}`
      );
    }

    if (reviewResult.issues.performance.length > 0) {
      sections.push(
        `## Performance Issues\n${reviewResult.issues.performance.map((issue: string) => `- ${issue}`).join('\n')}`
      );
    }

    if (reviewResult.issues.typescript.length > 0) {
      sections.push(
        `## TypeScript Issues\n${reviewResult.issues.typescript.map((issue: string) => `- ${issue}`).join('\n')}`
      );
    }

    return sections.length > 0 ? `\n\n${sections.join('\n\n')}` : '';
  }

  private buildApprovalSection(reviewResult: CodeReviewResponse): string {
    const isApproved = reviewResult.approvalRecommended;
    const emoji = isApproved ? '✅' : '❌';
    const status = isApproved ? 'Approved' : 'Changes Requested';

    return `## Review Status\n\n${emoji} **${status}**`;
  }

  private buildTokenUsageSection(reviewResult: CodeReviewResponse): string {
    if (!reviewResult.usageMetadata) {
      return '';
    }

    return `## Token Usage

| Model | Prompt Tokens | Completion Tokens | Total Tokens |
|-------|--------------|-------------------|--------------|
| ${this.config.llm.model} | ${reviewResult.usageMetadata.promptTokens} | ${reviewResult.usageMetadata.completionTokens} | ${reviewResult.usageMetadata.totalTokens} |`;
  }
}
