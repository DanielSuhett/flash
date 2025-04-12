export interface LlmResponse {
  content: string;
  usage: LlmUsage;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export interface LlmPrompt {
  text: string;
  targetLanguage?: string;
}
