import * as core from '@actions/core';
import {
  ActionConfig,
  CodeReviewResult,
  PullRequestInfo,
  IndexedCodebase,
} from '../types/index.js';
import { GitHubService } from '../github/github-service.js';
import { CodeIndexer } from '../indexing/indexer.js';
import { LlmService } from '../llm/llm-service.js';
import { AnalysisService } from './analysis-service.js';
import { createLlmService } from '../llm/llm-service.js';
import { LlmConfig, ReviewResult } from '../types/config.js';

export class WorkflowService {
  private config: ActionConfig;
  private githubService: GitHubService;
  private codeIndexer: CodeIndexer;
  private llmService: LlmService;
  private analysisService: AnalysisService;

  constructor(config: ActionConfig) {
    this.config = config;
    this.githubService = new GitHubService(config.githubToken);
    this.codeIndexer = new CodeIndexer(config.githubToken);

    const llmConfig: LlmConfig = {
      provider: config.llm.provider,
      apiKey: config.llm.apiKey,
      endpoint: config.llm.endpoint,
      model: config.llm.model,
      outputLanguage: config.llm.outputLanguage,
    };

    this.llmService = createLlmService(llmConfig);
    this.analysisService = new AnalysisService(config, this.llmService);
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
        core.warning(
          'No TypeScript files found in the repository. Review will be limited to changed files only.'
        );
      }

      core.info('Performing combined code analysis and review...');
      const analysisResult = await this.analyzeCodebase(indexedCodebase, pullRequestInfo);

      core.info('Posting review results...');
      await this.postReviewComment(pullRequestInfo, analysisResult.review, analysisResult);

      if (
        this.config.review.autoApprove &&
        analysisResult.review?.approvalRecommended &&
        this.shouldAutoApprove(analysisResult)
      ) {
        core.info('Auto-approval is enabled and recommended. Processing...');
        await this.approveAndMergePR(pullRequestInfo);
      }

      core.info('Code review completed successfully');
    } catch (error) {
      core.error(`Error during review process: ${error}`);
      throw error;
    }
  }

  private shouldAutoApprove(analysisResult: ReviewResult): boolean {
    return (
      analysisResult.metrics.complexity <= 7 &&
      analysisResult.metrics.maintainability >= 6 &&
      analysisResult.metrics.securityScore >= 8 &&
      analysisResult.metrics.performanceScore >= 8
    );
  }

  private async postReviewComment(
    pullRequest: PullRequestInfo,
    reviewResult: CodeReviewResult | undefined,
    analysisResult: ReviewResult
  ): Promise<void> {
    if (!reviewResult) {
      core.warning('No review result found. Skipping review comment.');

      return;
    }

    let comment = this.buildReviewComment(reviewResult, analysisResult);

    if (this.config.llm.outputLanguage !== 'en') {
      core.info(`Translating review to ${this.config.llm.outputLanguage}...`);

      const translatedResponse = await this.llmService.translateContent(
        comment,
        this.config.llm.outputLanguage
      );

      try {
        const translatedJson = JSON.parse(translatedResponse);

        comment = translatedJson.translation || translatedResponse;
      } catch {
        comment = translatedResponse;
      }

      comment = comment
        .replace(/\\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    const event =
      reviewResult.overallQuality >= this.config.review.qualityThreshold
        ? 'APPROVE'
        : 'REQUEST_CHANGES';

    const changedFiles = new Set(pullRequest.files.map((file) => file.filename));
    const inlineComments = reviewResult.comments
      .filter((comment) => changedFiles.has(comment.file))
      .map((comment) => ({
        path: comment.file,
        position: comment.startLine || 1,
        body: `**${comment.severity.toUpperCase()}** (${comment.category}): ${comment.message}`,
      }));

    await this.githubService.createReview(
      pullRequest.owner,
      pullRequest.repo,
      pullRequest.prNumber,
      pullRequest.headSha,
      comment,
      event,
      inlineComments
    );

    if (event === 'APPROVE' && this.config.review.autoMerge) {
      await this.githubService.mergePullRequest(
        pullRequest.owner,
        pullRequest.repo,
        pullRequest.prNumber
      );
    }
  }

  private buildReviewComment(reviewResult: CodeReviewResult, analysisResult: ReviewResult): string {
    const summary = this.buildSummarySection(reviewResult);
    const suggestions = this.buildSuggestionsSection(reviewResult);
    const metrics = this.buildMetricsSection(analysisResult);
    const issues = this.buildIssuesSection(analysisResult);
    const approval = this.buildApprovalSection(reviewResult);
    const tokenUsage = this.buildTokenUsageSection(analysisResult);
    const watermark = '\n\n---\n*Reviewed by rreviewer* 🤖';

    return `${summary}\n\n${approval}\n\n${suggestions}\n\n${metrics}\n\n${issues}\n\n${tokenUsage}${watermark}`;
  }

  private buildSummarySection(reviewResult: CodeReviewResult): string {
    const qualityEmoji =
      reviewResult.overallQuality >= 8 ? '🟢' : reviewResult.overallQuality >= 5 ? '🟡' : '🔴';

    return `# Code Review Summary\n\n${reviewResult.summary}\n\n## Overall Quality Score\n\n${qualityEmoji} **${reviewResult.overallQuality}/10**`;
  }

  private buildApprovalSection(reviewResult: CodeReviewResult): string {
    const approvalThreshold = this.config.review.qualityThreshold;
    const isApproved = reviewResult.overallQuality >= approvalThreshold;
    const emoji = isApproved ? '✅' : '❌';
    const status = isApproved ? 'Approved' : 'Changes Requested';

    return `## Review Status\n\n${emoji} **${status}**\n\n> Quality threshold for approval: ${approvalThreshold}/10`;
  }

  private buildSuggestionsSection(reviewResult: CodeReviewResult): string {
    const suggestions = reviewResult.comments
      .filter((comment) => comment.severity === 'suggestion')
      .map((comment) => `- ${comment.message}`);

    if (suggestions.length === 0) {
      return '';
    }

    return `## Suggested Improvements\n\n${suggestions.join('\n')}`;
  }

  private buildMetricsSection(analysisResult: ReviewResult): string {
    const metrics = analysisResult.metrics;
    const emojis = {
      complexity: this.getMetricEmoji(10 - metrics.complexity / 2),
      maintainability: this.getMetricEmoji(metrics.maintainability),
      securityScore: this.getMetricEmoji(metrics.securityScore),
      performanceScore: this.getMetricEmoji(metrics.performanceScore),
    };

    return (
      `## Code Quality Metrics\n\n` +
      `${emojis.complexity} **Complexity**: ${metrics.complexity}/10\n` +
      `${emojis.maintainability} **Maintainability**: ${metrics.maintainability}/10\n` +
      `${emojis.securityScore} **Security**: ${metrics.securityScore}/10\n` +
      `${emojis.performanceScore} **Performance**: ${metrics.performanceScore}/10`
    );
  }

  private getMetricEmoji(score: number): string {
    return score >= 8 ? '🟢' : score >= 5 ? '🟡' : '🔴';
  }

  private buildIssuesSection(analysisResult: ReviewResult): string {
    const sections = [];

    if (analysisResult.securityIssues.length > 0) {
      sections.push(
        `### 🔒 Security Issues\n\n${analysisResult.securityIssues
          .map((issue: string) => `- ⚠️ ${issue}`)
          .join('\n')}`
      );
    }

    if (analysisResult.performanceIssues.length > 0) {
      sections.push(
        `### ⚡ Performance Issues\n\n${analysisResult.performanceIssues
          .map((issue: string) => `- 🐢 ${issue}`)
          .join('\n')}`
      );
    }

    return sections.length > 0 ? `## Issues Found\n\n${sections.join('\n\n')}` : '';
  }

  private async approveAndMergePR(pullRequestInfo: PullRequestInfo): Promise<void> {
    const { owner, repo, prNumber } = pullRequestInfo;

    await this.githubService.approvePullRequest(owner, repo, prNumber);

    if (this.config.review.autoMerge) {
      await this.githubService.mergePullRequest(owner, repo, prNumber);
    }
  }

  private async analyzeCodebase(
    codebase: IndexedCodebase,
    pullRequest: PullRequestInfo
  ): Promise<ReviewResult> {
    const analysisResult = await this.analysisService.analyzeCodebase(codebase, pullRequest);

    return analysisResult;
  }

  private buildTokenUsageSection(analysisResult: ReviewResult): string {
    if (!analysisResult.tokenUsage) {
      return '';
    }

    return `## Token Usage

| Model | Prompt Tokens | Completion Tokens | Total Tokens |
|-------|--------------|-------------------|--------------|
| ${analysisResult.tokenUsage.model} | ${analysisResult.tokenUsage.promptTokens} | ${analysisResult.tokenUsage.completionTokens} | ${analysisResult.tokenUsage.totalTokens} |`;
  }
}
