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

      expect(prompt).toContain('You are an expert TypeScript code reviewer');
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
          "summary": "Test summary",
          "overallQuality": 8,
          "approvalRecommended": true,
          "comments": [
            {
              "file": "test.ts",
              "startLine": 1,
              "endLine": 5,
              "severity": "warning",
              "category": "performance",
              "message": "Test message"
            }
          ]
        }
      `;

      const result = LlmMapper.parseReviewResponse(response);

      expect(result).toEqual({
        summary: 'Test summary',
        overallQuality: 8,
        approvalRecommended: true,
        comments: [
          {
            file: 'test.ts',
            startLine: 1,
            endLine: 5,
            severity: 'warning',
            category: 'performance',
            message: 'Test message',
          },
        ],
      });
    });

    it('should return default values for invalid response', () => {
      const response = 'invalid json';
      const result = LlmMapper.parseReviewResponse(response);

      expect(result).toEqual({
        summary: 'invalid json'.slice(0, 500),
        overallQuality: 50,
        approvalRecommended: false,
        comments: [],
      });
    });

    it('should return default values for invalid structure', () => {
      const response = '{"invalid": "structure"}';
      const result = LlmMapper.parseReviewResponse(response);

      expect(result).toEqual({
        summary: '{"invalid": "structure"}'.slice(0, 500),
        overallQuality: 50,
        approvalRecommended: false,
        comments: [],
      });
    });
  });
});
