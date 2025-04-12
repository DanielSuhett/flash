export type LlmProvider = 'gemini' | 'openai' | 'anthropic';

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  endpoint?: string;
  model: string;
}

export interface AnalysisConfig {
  enableMetrics: boolean;
  enableSecurity: boolean;
  enablePerformance: boolean;
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
  analysis: AnalysisConfig;
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
}
