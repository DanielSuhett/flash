import { LlmRepository } from '../llm.repository.js';
import { LlmConfig } from '../entities/llm.entity.js';

describe('LlmRepository', () => {
  let repository: LlmRepository;
  let mockFetch: jest.Mock;

  const mockConfig: LlmConfig = {
    apiKey: 'test-api-key',
    model: 'gemini-2.0-flash',
    maxTokens: 2048,
  };

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    repository = new LlmRepository(mockConfig);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should make request to Gemini API', async (): Promise<void> => {
    const prompt = 'test prompt';
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: {
            parts: [{ text: 'response' }]
          }
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30
        }
      })
    };

    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await repository.generateContent(prompt);

    const expectedEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${mockConfig.model}:generateContent`;

    expect(mockFetch).toHaveBeenCalledWith(expectedEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': mockConfig.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generation_config: {
          max_output_tokens: mockConfig.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });

    expect(result).toEqual({
      content: 'response',
      usage: {
        model: mockConfig.model,
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    });
  });

  it('should handle API errors', async (): Promise<void> => {
    const prompt = 'test prompt';
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: { message: 'Bad Request' } })
    };

    mockFetch.mockResolvedValueOnce(mockResponse);

    await expect(repository.generateContent(prompt)).rejects.toThrow(
      'API request failed: 400 Bad Request'
    );
  });
});
