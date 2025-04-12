import { CodeReviewResult, IndexedCodebase, PullRequestInfo } from '../../../types/index.js';
import { GeminiResponse, LlmResponse } from '../entities/index.js';

export class LlmMapper {
  static buildReviewPrompt(indexedCodebase: IndexedCodebase, pullRequest: PullRequestInfo): string {
    const codebaseSummary = this.buildCodebaseSummary(indexedCodebase);
    const prSummary = this.buildPRSummary(pullRequest);

    return `
You are an expert TypeScript code reviewer. 
Please review the following pull request changes:

${prSummary}

Here's a summary of the codebase structure:
${codebaseSummary}

Please provide a detailed code review with the following structure:
1. A summary of the changes and their impact
2. A quality score from 0-10 (not 0-100)
3. A recommendation to approve or request changes
4. Detailed comments about specific issues found, including:
   - File and line numbers
   - Severity (error, warning, info, suggestion)
   - Category (type-safety, performance, maintainability, etc.)
   - Specific suggestions for improvement

IMPORTANT: Return ONLY a valid JSON object with this exact structure, 
without any markdown formatting, code blocks, or additional text:
{
  "summary": "string",
  "overallQuality": number (0-10),
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

  static buildTranslationPrompt(content: string, targetLanguage: string): string {
    return `Translate the following text to ${targetLanguage}. Keep all code blocks, markdown formatting, and technical terms in English. Only translate the natural language parts:

${content}`;
  }

  private static buildCodebaseSummary(indexedCodebase: IndexedCodebase): string {
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

  private static buildPRSummary(pullRequest: PullRequestInfo): string {
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

  static parseJsonResponse(text: string): string {
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);

    if (!jsonMatch) {
      const fallbackMatch = text.match(/\{[\s\S]*\}/);

      if (!fallbackMatch) {
        throw new Error('No JSON found in response');
      }

      return fallbackMatch[0];
    }

    return jsonMatch[1];
  }

  static parseReviewResponse(text: string): CodeReviewResult {
    try {
      const cleanJson = this.parseJsonResponse(text);
      const result = JSON.parse(cleanJson);

      if (
        !result.summary ||
        typeof result.overallQuality !== 'number' ||
        typeof result.approvalRecommended !== 'boolean' ||
        !Array.isArray(result.comments)
      ) {
        throw new Error('Invalid response structure');
      }

      return result;
    } catch (error) {
      console.warn(`Failed to parse JSON response: ${error}`);

      return {
        summary: text.slice(0, 500),
        overallQuality: 50,
        approvalRecommended: false,
        comments: [],
      };
    }
  }

  static buildGeminiEndpoint(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  static mapGeminiResponse(data: GeminiResponse): LlmResponse {
    return {
      content: data.candidates[0].content.parts[0].text,
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount,
        completionTokens: data?.usageMetadata?.candidatesTokenCount,
        totalTokens: data?.usageMetadata?.totalTokenCount,
      },
    };
  }
}
