export interface ActionConfig {
  githubToken: string;
  llmApiKey: string;
  llmEndpoint: string;
  autoApprove: boolean;
  autoMerge: boolean;
  indexCacheEnabled: boolean;
}

export interface PullRequestInfo {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  body: string | null;
  baseBranch: string;
  headBranch: string;
  author: string;
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

export interface CodeReviewResult {
  overallQuality: number;
  approvalRecommended: boolean;
  comments: CodeReviewComment[];
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