import * as core from '@actions/core';
import { LlmConfig, LlmResponse, GeminiResponse } from './entities/index.js';
import { LlmMapper } from './mappers/llm.mapper.js';

export class LlmRepository {
  constructor(private readonly config: LlmConfig) {}

  private mapper = LlmMapper;

  async generateContent(prompt: Array<{ text: string }>, returnJSON: boolean = true): Promise<LlmResponse> {
    core.info('Starting Gemini Service');

    if (!this.config?.apiKey) {
      throw new Error('Gemini API key is required');
    }

    const model = this.config?.model || 'gemini-2.5-flash';
    const endpoint = this.mapper.buildGeminiEndpoint(model);
    const response = await this.executeRequest(endpoint, prompt, returnJSON);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GeminiResponse;

    core.info(JSON.stringify(data));

    core.info(
      `Tokens used: ${data?.usageMetadata?.promptTokenCount} prompt, 
      ${data?.usageMetadata?.candidatesTokenCount} completion, 
      ${data?.usageMetadata?.totalTokenCount} total`
    );

    return this.mapper.mapGeminiResponse(data, model);
  }

  private async executeRequest(endpoint: string, prompt: Array<{ text: string }>, returnJSON = true): Promise<Response> {
    const systemInstruction = this.mapper.getSystemInstruction();

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
            parts: prompt,
          },
        ],
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        generation_config: {
          responseMimeType: returnJSON ? 'application/json' : 'text/plain',
          maxOutputTokens: this.config.maxTokens,
          temperature: 0.2,
        },
      }),
    });
  }
}
