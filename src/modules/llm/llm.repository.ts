import * as core from '@actions/core';
import { LlmConfig, LlmResponse, GeminiResponse } from './entities/index.js';
import { LlmMapper } from './mappers/llm.mapper.js';

export class LlmRepository {
  constructor(private readonly config: LlmConfig) {}

  private mapper = LlmMapper;

  async generateContent(prompt: string): Promise<LlmResponse> {
    core.info('Starting Gemini Service');

    if (!this.config?.apiKey) {
      throw new Error('Gemini API key is required');
    }

    const model = this.config?.model || 'gemini-2.0-flash';
    const endpoint = this.mapper.buildGeminiEndpoint(model);
    const response = await this.executeRequest(endpoint, prompt);
    const data = (await response.json()) as GeminiResponse;

    core.info(JSON.stringify(data));

    core.info(
      `Tokens used: ${data?.usageMetadata?.promptTokenCount} prompt, 
      ${data?.usageMetadata?.candidatesTokenCount} completion, 
      ${data?.usageMetadata?.totalTokenCount} total`
    );

    return this.mapper.mapGeminiResponse(data);
  }

  private async executeRequest(endpoint: string, prompt: string): Promise<Response> {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generation_config: {
          max_output_tokens: this.config.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });
  }
}
