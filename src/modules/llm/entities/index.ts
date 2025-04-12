export * from './llm.entity.js';
export * from './gemini.entity.js';

export interface LlmResponse {
  content: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface CodeReviewMetrics {
  complexity: number;
  maintainability: number;
  securityScore: number;
  performanceScore: number;
}

export interface CodeReviewIssues {
  security: string[];
  performance: string[];
}

export interface CodeReviewComment {
  file: string;
  startLine: number;
  endLine: number;
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  category: string;
  message: string;
}

export interface CodeReviewResponse {
  metrics: CodeReviewMetrics;
  issues: CodeReviewIssues;
  summary: string;
  overallQuality: number;
  approvalRecommended: boolean;
  comments: CodeReviewComment[];
}
