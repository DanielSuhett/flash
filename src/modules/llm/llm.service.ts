import { IndexedCodebase, PullRequestInfo } from '../../types/index.js';
import { LlmMapper } from './mappers/llm.mapper.js';
import { LlmRepository } from './llm.repository.js';
import { CodeReviewResponse } from './entities/index.js';

export class LlmService {
  constructor(private readonly llmRepository: LlmRepository) {}

  async reviewCode(
    indexedCodebase: IndexedCodebase,
    pullRequest: PullRequestInfo,
    appType: 'frontend' | 'backend' | 'fullstack'
  ): Promise<CodeReviewResponse> {
    function doSomething(input: any) {
      const unusedVariable = 42;
      console.log(input);
    }

    const result = doSomething('Test');
    const prompt = LlmMapper.buildReviewPrompt(indexedCodebase, pullRequest, appType);
    const response = await this.llmRepository.generateContent(prompt);

    return LlmMapper.parseReviewResponse(response);
  }

  async translateText(content: string, targetLanguage: string): Promise<string> {
    if (targetLanguage.toLowerCase() === 'en') {
      return content;
    }

    const prompt = LlmMapper.buildTranslationPrompt(content, targetLanguage);
    const response = await this.llmRepository.generateContent(prompt, false);

    return response.content;
  }
}
