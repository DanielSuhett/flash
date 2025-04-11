export type LlmProvider = 'gemini' | 'openai' | 'anthropic'

export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  endpoint?: string
  model: string
}

export interface FileFilterConfig {
  includePatterns: string[]
  excludePatterns: string[]
  maxFileSize: number
}

export interface AnalysisConfig {
  enableMetrics: boolean
  enableSecurity: boolean
  enablePerformance: boolean
  enableDocumentation: boolean
  enableTestCoverage: boolean
}

export interface ReviewConfig {
  autoApprove: boolean
  autoMerge: boolean
  reviewTemplate?: string
}

export interface IndexConfig {
  cacheEnabled: boolean
}

export interface ActionConfig {
  llm: LlmConfig
  fileFilter: FileFilterConfig
  analysis: AnalysisConfig
  review: ReviewConfig
  index: IndexConfig
  prNumber?: number
}

export interface CodeMetrics {
  complexity: number
  maintainability: number
  testCoverage: number
  documentationCoverage: number
  securityScore: number
  performanceScore: number
}

export interface ReviewResult {
  summary: string
  suggestions: string[]
  metrics: CodeMetrics
  securityIssues: string[]
  performanceIssues: string[]
  documentationIssues: string[]
  testCoverageIssues: string[]
} 