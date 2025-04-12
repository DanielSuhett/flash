import { CodeReviewResult, IndexedCodebase, PullRequestInfo } from '../../types/index.js';
import { LlmConfig, LlmResponse } from './entities/index.js';
import { LlmRepository } from './llm.repository.js';
import { LlmMapper } from './mappers/llm.mapper.js';

export class LlmService {
  private repository: LlmRepository;

  constructor(config: LlmConfig) {
    this.repository = new LlmRepository(config);
  }

  async generateContent(prompt: string): Promise<LlmResponse> {
    return this.repository.generateContent(prompt);
  }

  async performCodeReview(params: {
    indexedCodebase: IndexedCodebase;
    pullRequest: PullRequestInfo;
  }): Promise<CodeReviewResult> {
    const prompt = LlmMapper.buildReviewPrompt(params.indexedCodebase, params.pullRequest);
    const response = await this.generateContent(prompt);

    return LlmMapper.parseReviewResponse(response.content);
  }

  async translateContent(content: string, targetLanguage: string): Promise<string> {
    if (targetLanguage === 'en') {
      return content;
    }

    const prompt = LlmMapper.buildTranslationPrompt(content, targetLanguage);
    const response = await this.generateContent(prompt);

    return response.content;
  }
}
