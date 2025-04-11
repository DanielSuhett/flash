import * as core from '@actions/core';
import { ActionConfig, CodeReviewResult, PullRequestInfo } from '../types/index.js';
import { GitHubService } from '../github/github-service.js';
import { CodeIndexer } from '../indexing/indexer.js';
import { LLMService } from '../llm/llm-service.js';
import { AnalysisService } from './analysis-service.js';
import { createLlmService } from '../llm/llm-service.js';
import { LlmConfig, ReviewResult } from '../types/config.js';

export class WorkflowService {
  private config: ActionConfig;
  private githubService: GitHubService;
  private codeIndexer: CodeIndexer;
  private llmService: LLMService;
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
    };

    const llmService = createLlmService(llmConfig);

    this.llmService = new LLMService(llmConfig);
    this.analysisService = new AnalysisService(config.analysis, llmService);
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

      core.info('Performing code analysis...');
      const analysisResult = await this.analysisService.analyzeCodebase(indexedCodebase);

      core.info('Performing code review with LLM...');
      const reviewResult = await this.llmService.performCodeReview({
        indexedCodebase,
        pullRequest: prWithContents,
      });

      core.info('Posting review results...');
      await this.postReviewComment(pullRequestInfo, reviewResult, analysisResult);

      if (
        this.config.review.autoApprove &&
        reviewResult.approvalRecommended &&
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
      analysisResult.metrics.testCoverage >= 80 &&
      analysisResult.metrics.documentationCoverage >= 80 &&
      analysisResult.metrics.securityScore >= 8 &&
      analysisResult.metrics.performanceScore >= 8 &&
      analysisResult.securityIssues.length === 0 &&
      analysisResult.performanceIssues.length === 0
    );
  }

  private async postReviewComment(
    pullRequestInfo: PullRequestInfo,
    reviewResult: CodeReviewResult,
    analysisResult: ReviewResult
  ): Promise<void> {
    const { owner, repo, prNumber } = pullRequestInfo;
    const comment = this.buildReviewComment(reviewResult, analysisResult);

    await this.githubService.createComment(owner, repo, prNumber, comment);
  }

  private buildReviewComment(reviewResult: CodeReviewResult, analysisResult: ReviewResult): string {
    const summary = this.buildSummarySection(reviewResult);
    const suggestions = this.buildSuggestionsSection(reviewResult);
    const metrics = this.buildMetricsSection(analysisResult);
    const issues = this.buildIssuesSection(analysisResult);

    return `${summary}\n\n${suggestions}\n\n${metrics}\n\n${issues}`;
  }

  private buildSummarySection(reviewResult: CodeReviewResult): string {
    return `## Code Review Summary\n\n${reviewResult.summary}\n\nOverall Quality Score: ${
      reviewResult.overallQuality
    }/100`;
  }

  private buildSuggestionsSection(reviewResult: CodeReviewResult): string {
    return `## Suggested Improvements\n\n${reviewResult.comments
      .filter((comment) => comment.severity === 'suggestion')
      .map((comment) => `- ${comment.message}`)
      .join('\n')}`;
  }

  private buildMetricsSection(analysisResult: ReviewResult): string {
    return `## Code Metrics\n\n- Complexity: ${analysisResult.metrics.complexity}\n- Maintainability: ${
      analysisResult.metrics.maintainability
    }\n- Test Coverage: ${analysisResult.metrics.testCoverage}%`;
  }

  private buildIssuesSection(analysisResult: ReviewResult): string {
    const sections = [];

    if (analysisResult.securityIssues.length > 0) {
      sections.push(
        `### Security Issues\n\n${analysisResult.securityIssues
          .map((issue) => `- ${issue}`)
          .join('\n')}`
      );
    }

    if (analysisResult.performanceIssues.length > 0) {
      sections.push(
        `### Performance Issues\n\n${analysisResult.performanceIssues
          .map((issue) => `- ${issue}`)
          .join('\n')}`
      );
    }

    if (analysisResult.documentationIssues.length > 0) {
      sections.push(
        `### Documentation Issues\n\n${analysisResult.documentationIssues
          .map((issue) => `- ${issue}`)
          .join('\n')}`
      );
    }

    if (analysisResult.testCoverageIssues.length > 0) {
      sections.push(
        `### Test Coverage Issues\n\n${analysisResult.testCoverageIssues
          .map((issue) => `- ${issue}`)
          .join('\n')}`
      );
    }

    return sections.join('\n\n');
  }

  private async approveAndMergePR(pullRequestInfo: PullRequestInfo): Promise<void> {
    const { owner, repo, prNumber } = pullRequestInfo;

    await this.githubService.approvePullRequest(owner, repo, prNumber);

    if (this.config.review.autoMerge) {
      await this.githubService.mergePullRequest(owner, repo, prNumber);
    }
  }
}
