import { TokenUsage } from './index.js';

export interface PullRequestSummaryResponse {
  summary: string;
  usageMetadata: TokenUsage;
} 