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
      model: config.llm.model
    };
    
    const llmService = createLlmService(llmConfig);
    this.llmService = new LLMService(config.llm.apiKey, config.llm.endpoint);
    this.analysisService = new AnalysisService(config.analysis, llmService);
  }

  async processReview(owner: string, repo: string, prNumber: number): Promise<void> {
    try {
      core.info(`Starting review for PR #${prNumber} in ${owner}/${repo}`);
      
      const pullRequestInfo = await this.githubService.getPullRequestInfo(owner, repo, prNumber);
      core.info(`Analyzing PR: ${pullRequestInfo.title}`);
      
      const prWithContents = await this.githubService.loadFileContents(pullRequestInfo);
      core.info(`Loaded content for ${prWithContents.files.length} changed files`);
      
      const changedFiles = pullRequestInfo.files.map(file => file.filename);
      
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
        pullRequest: prWithContents
      });
      
      core.info('Posting review results...');
      await this.postReviewComment(pullRequestInfo, reviewResult, analysisResult);
      
      if (this.config.review.autoApprove && reviewResult.approvalRecommended && this.shouldAutoApprove(analysisResult)) {
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
    
    let commentBody = `# TypeScript Deep Code Review\n\n`;
    
    commentBody += `## Summary\n${reviewResult.summary}\n\n`;
    commentBody += `**Overall Quality Score**: ${reviewResult.overallQuality}/100\n`;
    commentBody += `**Recommendation**: ${reviewResult.approvalRecommended ? '✅ Approve' : '❌ Needs Improvement'}\n\n`;
    
    commentBody += `## Code Analysis Metrics\n\n`;
    commentBody += `- **Complexity**: ${analysisResult.metrics.complexity}/10\n`;
    commentBody += `- **Maintainability**: ${analysisResult.metrics.maintainability}/10\n`;
    commentBody += `- **Test Coverage**: ${analysisResult.metrics.testCoverage}%\n`;
    commentBody += `- **Documentation Coverage**: ${analysisResult.metrics.documentationCoverage}%\n`;
    commentBody += `- **Security Score**: ${analysisResult.metrics.securityScore}/10\n`;
    commentBody += `- **Performance Score**: ${analysisResult.metrics.performanceScore}/10\n\n`;
    
    if (analysisResult.suggestions.length > 0) {
      commentBody += `## Analysis Suggestions\n\n`;
      for (const suggestion of analysisResult.suggestions) {
        commentBody += `- ${suggestion}\n`;
      }
      commentBody += '\n';
    }
    
    if (analysisResult.securityIssues.length > 0) {
      commentBody += `## Security Issues\n\n`;
      for (const issue of analysisResult.securityIssues) {
        commentBody += `- 🔴 ${issue}\n`;
      }
      commentBody += '\n';
    }
    
    if (analysisResult.performanceIssues.length > 0) {
      commentBody += `## Performance Issues\n\n`;
      for (const issue of analysisResult.performanceIssues) {
        commentBody += `- 🚀 ${issue}\n`;
      }
      commentBody += '\n';
    }
    
    if (analysisResult.documentationIssues.length > 0) {
      commentBody += `## Documentation Issues\n\n`;
      for (const issue of analysisResult.documentationIssues) {
        commentBody += `- 📝 ${issue}\n`;
      }
      commentBody += '\n';
    }
    
    if (analysisResult.testCoverageIssues.length > 0) {
      commentBody += `## Test Coverage Issues\n\n`;
      for (const issue of analysisResult.testCoverageIssues) {
        commentBody += `- ✅ ${issue}\n`;
      }
      commentBody += '\n';
    }
    
    if (reviewResult.comments.length > 0) {
      commentBody += `## Detailed Code Review\n\n`;
      
      for (const comment of reviewResult.comments) {
        const locationInfo = comment.startLine 
          ? `lines ${comment.startLine}-${comment.endLine || comment.startLine}` 
          : '';
          
        const severity = {
          'error': '🔴 ERROR',
          'warning': '🟠 WARNING',
          'info': '🔵 INFO',
          'suggestion': '💡 SUGGESTION'
        }[comment.severity];
        
        commentBody += `### ${severity}: ${comment.file} ${locationInfo}\n`;
        commentBody += `**Category**: ${comment.category}\n\n`;
        commentBody += `${comment.message}\n\n`;
      }
    }
    
    commentBody += `---\n*This review was automatically generated by the TypeScript Deep Code Review GitHub Action.*`;
    
    await this.githubService.createComment(owner, repo, prNumber, commentBody);
  }

  private async approveAndMergePR(pullRequestInfo: PullRequestInfo): Promise<void> {
    const { owner, repo, prNumber } = pullRequestInfo;
    await this.githubService.approvePullRequest(owner, repo, prNumber);
    
    if (this.config.review.autoMerge) {
      await this.githubService.mergePullRequest(owner, repo, prNumber);
    }
  }
} 