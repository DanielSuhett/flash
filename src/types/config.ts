import { CodeReviewResult } from './index.js';

export interface LlmConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  outputLanguage?: string;
}

export interface ActionConfig {
  llm: LlmConfig;
  prNumber?: number;
}

export interface ReviewResult {
  summary: string;
  suggestions: string[];
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
