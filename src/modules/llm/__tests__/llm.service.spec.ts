import { CodeReviewResult, IndexedCodebase, PullRequestInfo } from '../../../types/index.js';
import { LlmConfig, LlmResponse } from '../entities/index.js';
import { LlmMapper } from '../mappers/llm.mapper.js';
import { LlmRepository } from '../llm.repository.js';
import { LlmService } from '../llm.service.js';

jest.mock('./llm.repository.js');
jest.mock('./mappers/llm.mapper.js');

describe('LlmService', () => {
  let service: LlmService;
  let mockConfig: LlmConfig;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-key',
      model: 'test-model',
    };
    service = new LlmService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateContent', () => {
    it('should delegate to repository', async () => {
      const mockResponse: LlmResponse = {
        content: 'test content',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      (LlmRepository.prototype.generateContent as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.generateContent('test prompt');

      expect(LlmRepository.prototype.generateContent).toHaveBeenCalledWith('test prompt');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('performCodeReview', () => {
    const mockIndexedCodebase: IndexedCodebase = {
      files: [
        {
          path: 'test.ts',
          declarations: [],
          content: 'test content',
        },
      ],
      dependencies: {},
      imports: {},
    };

    const mockPullRequest: PullRequestInfo = {
      title: 'Test PR',
      body: 'Test description',
      files: [],
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
      description: 'Test description',
      baseBranch: '',
      headBranch: '',
      headSha: '',
    };

    const mockReviewResult: CodeReviewResult = {
      summary: 'test summary',
      overallQuality: 8,
      approvalRecommended: true,
      comments: [],
    };

    it('should orchestrate code review process', async () => {
      const mockPrompt = 'test review prompt';
      const mockResponse: LlmResponse = {
        content: 'test content',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      (LlmMapper.buildReviewPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (LlmRepository.prototype.generateContent as jest.Mock).mockResolvedValue(mockResponse);
      (LlmMapper.parseReviewResponse as jest.Mock).mockReturnValue(mockReviewResult);

      const result = await service.performCodeReview({
        indexedCodebase: mockIndexedCodebase,
        pullRequest: mockPullRequest,
      });

      expect(LlmMapper.buildReviewPrompt).toHaveBeenCalledWith(
        mockIndexedCodebase,
        mockPullRequest
      );
      expect(LlmRepository.prototype.generateContent).toHaveBeenCalledWith(mockPrompt);
      expect(LlmMapper.parseReviewResponse).toHaveBeenCalledWith(mockResponse.content);
      expect(result).toEqual(mockReviewResult);
    });
  });

  describe('translateContent', () => {
    it('should return original content for English target', async () => {
      const content = 'test content';
      const result = await service.translateContent(content, 'en');

      expect(result).toBe(content);
      expect(LlmRepository.prototype.generateContent).not.toHaveBeenCalled();
    });

    it('should translate content to target language', async () => {
      const content = 'test content';
      const mockPrompt = 'test translation prompt';
      const mockResponse: LlmResponse = {
        content: 'translated content',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      (LlmMapper.buildTranslationPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (LlmRepository.prototype.generateContent as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.translateContent(content, 'pt-BR');

      expect(LlmMapper.buildTranslationPrompt).toHaveBeenCalledWith(content, 'pt-BR');
      expect(LlmRepository.prototype.generateContent).toHaveBeenCalledWith(mockPrompt);
      expect(result).toBe(mockResponse.content);
    });
  });
});
