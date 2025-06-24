import { LlmConfig } from './config.js';

export interface ActionConfig {
  githubToken: string;
  llm: LlmConfig;
  prNumber?: number;
}

export interface PullRequestInfo {
  body: string;
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  files: FileChange[];
}

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  contents?: string;
}

export interface IndexedFile {
  path: string;
  content: string;
  declarations: Declaration[];
}

export interface Declaration {
  type: 'class' | 'interface' | 'type' | 'enum' | 'function' | 'const' | 'var' | 'namespace';
  name: string;
  location: {
    startLine: number;
    endLine: number;
  };
  modifiers?: string[];
  exported: boolean;
  dependencies?: string[];
  members?: Declaration[];
}

export interface IndexedCodebase {
  files: IndexedFile[];
  dependencies: Record<string, string[]>;
  imports: Record<string, string[]>;
}

export interface CodeReviewRequest {
  indexedCodebase: IndexedCodebase;
  pullRequest: PullRequestInfo;
}

export interface PullRequestSummaryResult {
  summary: string;
}

export interface CodeReviewComment {
  file: string;
  startLine?: number;
  endLine?: number;
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  message: string;
  category: 'security' | 'performance' | 'maintainability' | 'logic' | 'style';
}

export type LlmProvider = 'gemini' | 'openai' | 'anthropic';

export interface MarkdownCodebase {
  content: string;
  includedFiles: string[];
  tokenCount?: number;
  totalFiles: number;
  ignoredFiles: number;
  binaryFiles: number;
}
