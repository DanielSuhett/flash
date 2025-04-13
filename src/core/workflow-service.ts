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

      if (this.config.review.autoApprove && reviewResult.approvalRecommended && this.shouldAutoApprove(reviewResult)) {
        core.info('Auto-approval is enabled and recommended. Processing...');
        await this.approveAndMergePR(prWithContents);
      }

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

    if (event === 'APPROVE' && this.config.review.autoMerge) {
      await this.githubService.mergePullRequest(pullRequest.owner, pullRequest.repo, pullRequest.prNumber);
    }
  }

  private buildReviewComment(reviewResult: CodeReviewResponse): string {
    const summary = this.buildSummarySection(reviewResult);
    const suggestions = this.buildSuggestionsSection(reviewResult);
    const issues = this.buildIssuesSection(reviewResult);
    const approval = this.buildApprovalSection(reviewResult);
    const tokenUsage = this.buildTokenUsageSection(reviewResult);
    const watermark = '\n\n---\n*Reviewed by rreviewer* 🤖';

    const sections = [summary, approval, tokenUsage];
    
    if (suggestions) sections.push(suggestions);
    if (issues) sections.push(issues);

    return sections
      .filter(Boolean)
      .join('\n\n')
      .concat(watermark);
  }

  private buildSummarySection(reviewResult: CodeReviewResponse): string {
    return `# Code Review Summary\n\n${reviewResult.summary}`;
  }

  private buildSuggestionsSection(reviewResult: CodeReviewResponse): string {
    const sections = [];

    if (reviewResult.suggestions?.critical.length > 0) {
      sections.push(
        '## Critical Issues 🚨\n\n' +
          reviewResult.suggestions.critical
            .map(
              (suggestion) =>
                `- **${suggestion.category}** (${suggestion.file}:${suggestion.location}):\n  ${suggestion.description}`
            )
            .join('\n\n')
      );
    }

    if (reviewResult.suggestions?.important.length > 0) {
      sections.push(
        '## Important Improvements ⚠️\n\n' +
          reviewResult.suggestions.important
            .map(
              (suggestion) =>
                `- **${suggestion.category}** (${suggestion.file}:${suggestion.location}):\n  ${suggestion.description}`
            )
            .join('\n\n')
      );
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  }

  private buildIssuesSection(reviewResult: CodeReviewResponse): string {
    if (!reviewResult.issues || Object.keys(reviewResult.issues).length === 0) {
      return '';
    }

    const sections = [];

    if (reviewResult.issues?.security && reviewResult.issues?.security.length > 0) {
      sections.push(
        '## Security Issues 🔒\n\n' +
          reviewResult.issues.security.map((issue) => `- ${issue}`).join('\n')
      );
    }

    if (reviewResult.issues?.performance && reviewResult.issues?.performance.length > 0) {
      sections.push(
        '## Performance Issues ⚡\n\n' +
          reviewResult.issues.performance.map((issue) => `- ${issue}`).join('\n')
      );
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  }

  private buildApprovalSection(reviewResult: CodeReviewResponse): string {
    const emoji = reviewResult.approvalRecommended ? '✅' : '❌';
    const status = reviewResult.approvalRecommended ? 'Approved' : 'Changes Requested';
    return `## Review Status\n\n${emoji} **${status}**`;
  }

  private buildTokenUsageSection(reviewResult: CodeReviewResponse): string {
    if (!reviewResult.usageMetadata) {
      return '';
    }

    return `## Token Usage\n\n| Model | Prompt Tokens | Completion Tokens | Total Tokens |\n|-------|--------------|-------------------|--------------|\n| ${this.config.llm.model} | ${reviewResult.usageMetadata.promptTokens} | ${reviewResult.usageMetadata.completionTokens} | ${reviewResult.usageMetadata.totalTokens} |`;
  }

  private async approveAndMergePR(pullRequest: PullRequestInfo): Promise<void> {
    await this.githubService.approvePullRequest(pullRequest.owner, pullRequest.repo, pullRequest.prNumber);

    if (this.config.review.autoMerge) {
      await this.githubService.mergePullRequest(pullRequest.owner, pullRequest.repo, pullRequest.prNumber);
    }
  }
}
