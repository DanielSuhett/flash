import { PullRequestInfo } from '../../types/index.js';
import { LlmMapper } from './mappers/llm.mapper.js';
import { LlmRepository } from './llm.repository.js';
import { PullRequestSummaryResponse } from './entities/index.js';

export class LlmService {
  constructor(private readonly llmRepository: LlmRepository) {}

  async summarizePullRequest(
    pullRequest: PullRequestInfo,
    outputLanguage: string = 'en',
    commitMessages: string[] = []
  ): Promise<PullRequestSummaryResponse> {
    const prompt = LlmMapper.buildSummaryPrompt(pullRequest, commitMessages, outputLanguage);
    const systemInstruction = LlmMapper.getSummarySystemInstruction(outputLanguage);
    const response = await this.llmRepository.generateContent(prompt, false, systemInstruction);

    return LlmMapper.parseSummaryResponse(response);
  }
}
