import { AnalysisConfig, CodeMetrics, ReviewResult } from '../types/config.js';
import { IndexedCodebase } from '../types/index.js';
import { LlmService } from '../llm/llm-service.js';
import { PullRequestInfo } from '../types/index.js';

interface AnalysisResponse {
  metrics: {
    complexity: number;
    maintainability: number;
    securityScore: number;
    performanceScore: number;
  };
  issues: {
    security: string[];
    performance: string[];
  };
  summary: string;
  review: {
    overallQuality: number;
    approvalRecommended: boolean;
    comments: {
      file: string;
      startLine: number;
      endLine: number;
      severity: string;
      category: string;
      message: string;
    }[];
  };
}

export class AnalysisService {
  constructor(
    private config: AnalysisConfig,
    private llmService: LlmService
  ) {}

  async analyzeCodebase(
    codebase: IndexedCodebase,
    pullRequest?: PullRequestInfo
  ): Promise<ReviewResult> {
    const analysis = await this.performAnalysis(codebase, pullRequest);

    return {
      summary: analysis.summary,
      suggestions: this.generateSuggestions(analysis.metrics, analysis.issues),
      metrics: analysis.metrics,
      securityIssues: this.config.enableSecurity ? analysis.issues.security : [],
      performanceIssues: this.config.enablePerformance ? analysis.issues.performance : [],
      review:
        pullRequest && analysis.review
          ? {
              summary: analysis.summary,
              overallQuality: analysis.review.overallQuality,
              approvalRecommended: analysis.review.approvalRecommended,
              comments: analysis.review.comments.map((comment) => ({
                ...comment,
                severity: comment.severity as 'error' | 'warning' | 'info' | 'suggestion',
              })),
            }
          : undefined,
    };
  }

  private async performAnalysis(
    codebase: IndexedCodebase,
    pullRequest?: PullRequestInfo
  ): Promise<AnalysisResponse> {
    const codebaseSummary = this.buildCodebaseSummary(codebase);
    const prSummary = pullRequest ? this.buildPRSummary(pullRequest) : '';
    const prompt = `You are an expert TypeScript code reviewer. Please analyze the following codebase${
      pullRequest ? ' and review the pull request changes' : ''
    }:

${prSummary ? `Pull Request Changes:\n${prSummary}\n\n` : ''}
Codebase Structure:
${codebaseSummary}

Please provide a comprehensive analysis with the following structure:
1. Code Metrics (all scores from 0-10):
   - Complexity score
   - Maintainability score
   - Security score
   - Performance score

2. Issues found:
   - Security vulnerabilities
   - Performance bottlenecks

3. A summary of the overall code quality and recommendations${
      pullRequest ? ' including review of the changes' : ''
    }

${
  pullRequest
    ? `4. Code Review Details:
   - File and line numbers
   - Severity (error, warning, info, suggestion)
   - Category (type-safety, performance, maintainability, etc.)
   - Specific suggestions for improvement`
    : ''
}

IMPORTANT: Return ONLY a valid JSON object with this exact structure:
{
  "metrics": {
    "complexity": number,
    "maintainability": number,
    "securityScore": number,
    "performanceScore": number
  },
  "issues": {
    "security": string[],
    "performance": string[]
  },
  "summary": string${
    pullRequest
      ? `,
  "review": {
    "overallQuality": number,
    "approvalRecommended": boolean,
    "comments": [
      {
        "file": string,
        "startLine": number,
        "endLine": number,
        "severity": "error" | "warning" | "info" | "suggestion",
        "category": string,
        "message": string
      }
    ]
  }`
      : ''
  }
}`;

    const response = await this.llmService.generateContent(prompt);
    const result = JSON.parse(response.content);

    return result;
  }

  private buildCodebaseSummary(codebase: IndexedCodebase): string {
    const summary: string[] = [];

    for (const file of codebase.files) {
      const declarations = file.declarations
        .map((decl) => {
          const deps = decl.dependencies?.length ? `[deps:${decl.dependencies.join(',')}]` : '';

          return `${decl.type}:${decl.name}${decl.exported ? ':exported' : ''}${deps}`;
        })
        .join(';');

      summary.push(`${file.path}|${declarations}`);
    }

    const dependencies = Object.entries(codebase.dependencies)
      .map(([key, deps]) => `${key}:${deps.join(',')}`)
      .join(';');

    const imports = Object.entries(codebase.imports)
      .map(([key, imps]) => `${key}:${imps.join(',')}`)
      .join(';');

    return ['FILES:', summary.join('\n'), 'DEPENDENCIES:', dependencies, 'IMPORTS:', imports].join(
      '\n'
    );
  }

  private buildPRSummary(pullRequest: PullRequestInfo): string {
    const summary = [
      `Title: ${pullRequest.title}`,
      `Description: ${pullRequest.description || 'No description provided'}`,
      '\nChanged Files:',
    ];

    for (const file of pullRequest.files) {
      summary.push(`${file.filename} (${file.additions} additions, ${file.deletions} deletions)`);
      if (file.contents) {
        summary.push('```typescript\n' + file.contents + '\n```');
      }
    }

    return summary.join('\n');
  }

  private generateSuggestions(
    metrics: CodeMetrics,
    _issues: {
      security: string[];
      performance: string[];
    }
  ): string[] {
    const suggestions: string[] = [];

    if (metrics.complexity > 10) {
      suggestions.push('Consider refactoring complex functions to improve readability');
    }

    if (metrics.maintainability < 8) {
      suggestions.push('Improve code organization to enhance maintainability');
    }

    if (metrics.securityScore < 8) {
      suggestions.push('Address security vulnerabilities to improve code safety');
    }

    if (metrics.performanceScore < 8) {
      suggestions.push('Optimize performance bottlenecks to improve code efficiency');
    }

    return suggestions;
  }
}
