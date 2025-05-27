import { PullRequestInfo } from '../../types/index.js';
import { LlmMapper } from './mappers/llm.mapper.js';
import { LlmRepository } from './llm.repository.js';
import { CodeReviewResponse } from './entities/index.js';

export class LlmService {
  constructor(private readonly llmRepository: LlmRepository) {}

  async reviewCode(pullRequest: PullRequestInfo): Promise<CodeReviewResponse> {
    const prompt = LlmMapper.buildReviewPrompt(pullRequest);
    const response = await this.llmRepository.generateContent(prompt, true);

    return LlmMapper.parseReviewResponse(response);
  }

  async translateText(content: string, targetLanguage: string): Promise<string> {
    if (targetLanguage.toLowerCase() === 'en') {
      return content;
    }

    const prompt = LlmMapper.buildTranslationPrompt(content, targetLanguage);
    const response = await this.llmRepository.generateContent([{ text: prompt }], false);

    return response.content;
  }
}
