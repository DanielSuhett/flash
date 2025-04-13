import { CodeReviewResult } from './index.js';

export interface LlmConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  outputLanguage?: string;
}


export interface ReviewConfig {
  autoApprove: boolean;
  autoMerge: boolean;
  qualityThreshold: number;
}

export interface IndexConfig {
  cacheEnabled: boolean;
}

export interface ActionConfig {
  llm: LlmConfig;
  review: ReviewConfig;
  index: IndexConfig;
  prNumber?: number;
}

export interface CodeMetrics {
  complexity: number;
  maintainability: number;
  securityScore: number;
  performanceScore: number;
}

export interface ReviewResult {
  summary: string;
  suggestions: string[];
  metrics: CodeMetrics;
  securityIssues: string[];
  performanceIssues: string[];
  review?: CodeReviewResult;
  tokenUsage?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
