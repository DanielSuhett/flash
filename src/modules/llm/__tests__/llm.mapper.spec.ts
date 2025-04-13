import { IndexedCodebase, PullRequestInfo } from '../../../types/index.js';
import { LlmMapper } from '../mappers/llm.mapper.js';

describe('LlmMapper', () => {
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

  describe('buildReviewPrompt', () => {
    it('should generate a valid review prompt', () => {
      const prompt = LlmMapper.buildReviewPrompt(mockIndexedCodebase, mockPullRequest, 'backend');

      expect(prompt).toContain('You have 10 years of experience in developing and reviewing large-scale TypeScript applications');
      expect(prompt).toContain('Test PR');
      expect(prompt).toContain('Test description');
      expect(prompt).toContain('src/test.ts');
      expect(prompt).toContain('TestClass');
      expect(prompt).toContain('Dependency1, Dependency2');
      expect(prompt).toContain('test code content');
    });
  });

  describe('buildTranslationPrompt', () => {
    it('should generate a valid translation prompt', () => {
      const content = 'Test content with ```code block```';
      const targetLanguage = 'pt-BR';

      const prompt = LlmMapper.buildTranslationPrompt(content, targetLanguage);

      expect(prompt).toContain('Translate the following text to pt-BR');
      expect(prompt).toContain('Test content with ```code block```');
      expect(prompt).toContain('Keep all code blocks');
    });
  });

  describe('parseJsonResponse', () => {
    it('should extract JSON from markdown code block', () => {
      const response = '```json\n{"test": "value"}\n```';
      const result = LlmMapper.parseJsonResponse(response);

      expect(result).toBe('{"test": "value"}');
    });

    it('should extract JSON without code block', () => {
      const response = '{"test": "value"}';
      const result = LlmMapper.parseJsonResponse(response);

      expect(result).toBe('{"test": "value"}');
    });

    it('should throw error when no JSON is found', () => {
      const response = 'invalid response';

      expect(() => LlmMapper.parseJsonResponse(response)).toThrow('No JSON found in response');
    });
  });

  describe('parseReviewResponse', () => {
    it('should parse valid review response', () => {
      const response = `
        {
          "issues": {
            "security": ["test security issue"],
            "performance": ["test performance issue"]
          },
          "summary": "Test summary",
          "approvalRecommended": true,
          "suggestions": {
            "critical": [],
            "important": [],
            "minor": []
          },
          "usageMetadata": {
            "promptTokenCount": 100,
            "candidatesTokenCount": 50,
            "totalTokenCount": 150
          }
        }
      `;

      const result = LlmMapper.parseReviewResponse({
        content: response,
        usage: {
          model: 'test-model',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      expect(result).toEqual({
          issues: {
          security: ["test security issue"],
          performance: ["test performance issue"]
        },
        summary: "Test summary",
        approvalRecommended: true,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: {
          model: 'test-model',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        }
      });
    });

    it('should return default values for invalid response', () => {
      const response = 'invalid json';
      const result = LlmMapper.parseReviewResponse({
        content: response,
        usage: {
          model: 'test-model',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });

      expect(result).toEqual({
        issues: {
          security: [],
          performance: []
        },
        summary: response.slice(0, 500),
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: {
          model: 'test-model',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      });
    });

    it('should return default values for invalid structure', () => {
      const response = '{"invalid": "structure"}';
      const result = LlmMapper.parseReviewResponse({
        content: response,
        usage: {
          model: 'test-model',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });

      expect(result).toEqual({
        issues: {
          security: [],
          performance: []
        },
        summary: response.slice(0, 500),
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: {
          model: 'test-model',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      });
    });
  });
});
