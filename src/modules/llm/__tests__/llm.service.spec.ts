import { CodeReviewResult, IndexedCodebase, PullRequestInfo } from '../../../types/index.js';
import { LlmResponse } from '../entities/index.js';
import { LlmMapper } from '../mappers/llm.mapper.js';
import { LlmRepository } from '../llm.repository.js';
import { LlmService } from '../llm.service.js';

jest.mock('./llm.repository.js');
jest.mock('./mappers/llm.mapper.js');

describe('LlmService', () => {
  let service: LlmService;
  const mockIndexedCodebase: IndexedCodebase = {
    files: [
      {
        path: 'src/test.ts',
        declarations: [
          {
            type: 'class',
            name: 'TestClass',
            exported: true,
            dependencies: ['Dependency1', 'Dependency2'],
            location: {
              startLine: 0,
              endLine: 0,
            },
          },
        ],
        content: 'test content',
      },
    ],
    dependencies: {},
    imports: {},
  };
  const mockPullRequest: PullRequestInfo = {
    title: 'Test PR',
    body: 'Test description',
    files: [
      {
        filename: 'src/test.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        contents: 'test code content',
        changes: 0,
      },
    ],
    owner: '',
    repo: '',
    prNumber: 0,
    description: '',
    baseBranch: '',
    headBranch: '',
    headSha: '',
  };

  beforeEach(() => {
    service = new LlmService(
      new LlmRepository({
        apiKey: 'test-key',
        model: 'test-model',
        maxTokens: 1000,
      })
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateContent', () => {
    it('should delegate to repository', async () => {
      const mockResponse: LlmResponse = {
        content: 'test content',
        usage: {
          model: 'test-model',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      (LlmRepository.prototype.generateContent as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.reviewCode(mockIndexedCodebase, mockPullRequest, 'backend');

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
          model: 'test-model',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      (LlmMapper.buildReviewPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (LlmRepository.prototype.generateContent as jest.Mock).mockResolvedValue(mockResponse);
      (LlmMapper.parseReviewResponse as jest.Mock).mockReturnValue(mockReviewResult);

      const result = await service.reviewCode(mockIndexedCodebase, mockPullRequest, 'backend');

      expect(LlmMapper.buildReviewPrompt).toHaveBeenCalledWith(
        mockIndexedCodebase,
        mockPullRequest,
        'backend'
      );
      expect(LlmRepository.prototype.generateContent).toHaveBeenCalledWith(mockPrompt);
      expect(LlmMapper.parseReviewResponse).toHaveBeenCalledWith(mockResponse.content);
      expect(result).toEqual(mockReviewResult);
    });
  });

  describe('translateText', () => {
    it('should return original content for English target', async () => {
      const content = 'test content';
      const result = await service.translateText(content, 'en');

      expect(result).toBe(content);
      expect(LlmRepository.prototype.generateContent).not.toHaveBeenCalled();
    });

    it('should translate content to target language', async () => {
      const content = 'test content';
      const mockPrompt = 'test translation prompt';
      const mockResponse: LlmResponse = {
        content: 'translated content',
        usage: {
          model: 'test-model',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      (LlmMapper.buildTranslationPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (LlmRepository.prototype.generateContent as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.translateText(content, 'pt-BR');

      expect(LlmMapper.buildTranslationPrompt).toHaveBeenCalledWith(content, 'pt-BR');
      expect(LlmRepository.prototype.generateContent).toHaveBeenCalledWith(mockPrompt);
      expect(result).toBe(mockResponse.content);
    });
  });
});
