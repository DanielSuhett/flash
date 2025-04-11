import * as core from '@actions/core';
import { CodeReviewResult, IndexedCodebase, PullRequestInfo } from '../types/index.js';
import { LlmConfig } from '../types/config.js'

export interface LlmResponse {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface LlmService {
  generateContent(prompt: string): Promise<LlmResponse>
}

export class GeminiService implements LlmService {
  constructor(private config: LlmConfig) {}

  async generateContent(prompt: string): Promise<LlmResponse> {
    const endpoint = this.config.endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    })

    const data = await response.json()
    return {
      content: data.candidates[0].content.parts[0].text,
      usage: {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount
      }
    }
  }
}

export class OpenAIService implements LlmService {
  constructor(private config: LlmConfig) {}

  async generateContent(prompt: string): Promise<LlmResponse> {
    const response = await fetch(this.config.endpoint || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    const data = await response.json()
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    }
  }
}

export class AnthropicService implements LlmService {
  constructor(private config: LlmConfig) {}

  async generateContent(prompt: string): Promise<LlmResponse> {
    const response = await fetch(this.config.endpoint || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 4096
      })
    })

    const data = await response.json()
    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      }
    }
  }
}

export function createLlmService(config: LlmConfig): LlmService {
  switch (config.provider) {
    case 'gemini':
      return new GeminiService(config)
    case 'openai':
      return new OpenAIService(config)
    case 'anthropic':
      return new AnthropicService(config)
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`)
  }
}

export class LLMService {
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint: string = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent') {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  async performCodeReview(params: {
    indexedCodebase: IndexedCodebase;
    pullRequest: PullRequestInfo;
  }): Promise<CodeReviewResult> {
    const { indexedCodebase, pullRequest } = params;
    
    const prompt = this.buildReviewPrompt(indexedCodebase, pullRequest);
    
    try {
      const response = await this.callGeminiAPI(prompt);
      const text = response.candidates[0].content.parts[0].text;
      
      return this.parseReviewResponse(text);
    } catch (error) {
      core.error(`Error calling Gemini API: ${error}`);
      throw error;
    }
  }

  private buildReviewPrompt(
    indexedCodebase: IndexedCodebase,
    pullRequest: PullRequestInfo
  ): string {
    const codebaseSummary = this.buildCodebaseSummary(indexedCodebase);
    const prSummary = this.buildPRSummary(pullRequest);
    
    return `You are an expert TypeScript code reviewer. Please review the following pull request changes:

${prSummary}

Here's a summary of the codebase structure:
${codebaseSummary}

Please provide a detailed code review with the following structure:
1. A summary of the changes and their impact
2. A quality score from 0-100
3. A recommendation to approve or request changes
4. Detailed comments about specific issues found, including:
   - File and line numbers
   - Severity (error, warning, info, suggestion)
   - Category (type-safety, performance, maintainability, etc.)
   - Specific suggestions for improvement

Format your response as a JSON object with this structure:
{
  "summary": "string",
  "overallQuality": number,
  "approvalRecommended": boolean,
  "comments": [
    {
      "file": "string",
      "startLine": number,
      "endLine": number,
      "severity": "error" | "warning" | "info" | "suggestion",
      "category": "string",
      "message": "string"
    }
  ]
}`;
  }

  private buildCodebaseSummary(indexedCodebase: IndexedCodebase): string {
    let summary = '';
    
    for (const file of indexedCodebase.files) {
      summary += `\nFile: ${file.path}\n`;
      
      for (const decl of file.declarations) {
        summary += `  - ${decl.type} ${decl.name}`;
        if (decl.exported) summary += ' (exported)';
        if (decl.dependencies?.length) {
          summary += `\n    Dependencies: ${decl.dependencies.join(', ')}`;
        }
        summary += '\n';
      }
    }
    
    return summary;
  }

  private buildPRSummary(pullRequest: PullRequestInfo): string {
    let summary = `Title: ${pullRequest.title}\n`;
    summary += `Description: ${pullRequest.body || 'No description'}\n\n`;
    summary += `Changed Files:\n`;
    
    for (const file of pullRequest.files) {
      summary += `\n${file.filename} (${file.status}, +${file.additions}, -${file.deletions}):\n`;
      if (file.contents) {
        summary += `\`\`\`typescript\n${file.contents}\`\`\`\n`;
      }
    }
    
    return summary;
  }

  private async callGeminiAPI(prompt: string): Promise<any> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }
    
    return response.json();
  }

  private parseReviewResponse(text: string): CodeReviewResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const result = JSON.parse(jsonMatch[0]);
      
      if (!result.summary || typeof result.overallQuality !== 'number' || 
          typeof result.approvalRecommended !== 'boolean' || !Array.isArray(result.comments)) {
        throw new Error('Invalid response structure');
      }
      
      return result;
    } catch (error) {
      core.warning(`Failed to parse JSON response: ${error}`);
      
      return {
        summary: text.slice(0, 500),
        overallQuality: 50,
        approvalRecommended: false,
        comments: []
      };
    }
  }
} 