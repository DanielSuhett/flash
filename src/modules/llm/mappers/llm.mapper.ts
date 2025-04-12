import { IndexedCodebase, PullRequestInfo } from '../../../types/index.js';
import { CodeReviewResponse, GeminiResponse, LlmResponse } from '../entities/index.js';

export class LlmMapper {
  static buildReviewPrompt(
    indexedCodebase: IndexedCodebase,
    pullRequest: PullRequestInfo,
    appType: 'frontend' | 'backend' | 'fullstack'
  ): string {
    const codebaseSummary = this.buildCodebaseSummary(indexedCodebase);
    const prSummary = this.buildPRSummary(pullRequest);

    return `
You have 10 years of experience in developing and reviewing large-scale TypeScript applications. You prioritize type safety, performance, and long-term maintainability. 
You are familiar with common TypeScript best practices and design patterns. 
You are specializing in web application development. Your task is to analyze Pull Request changes meticulously:

Here's a summary of the PR changes:
${prSummary}

Here's a summary of the codebase structure:
${codebaseSummary}

Review Focus:
In addition to general TypeScript best practices (type-safety, performance, maintainability, readability), 
please pay special attention to the following aspects relevant to a ${appType ?? 'fullstack'} application:

Please provide a detailed code review with the following structure:
1. A summary of the changes and their impact
2. Code quality metrics:
   - Complexity score (0-10)
   - Maintainability score (0-10)
   - Security score (0-10)
   - Performance score (0-10)
3. A quality score from 0-10 (not 0-100)
4. A recommendation to approve or request changes
5. Organized suggestions by category:
   - Critical issues that must be fixed
   - Important improvements recommended
   - Minor suggestions for better code quality
   Each suggestion should include:
   - Category (type-safety, performance, maintainability, etc.)
   - File location (file path and line numbers)
   - Clear explanation of the issue and how to fix it
   - Exclude documentation and comment expectations from review criteria

6. List any security or performance issues identified
7. Identify both critical errors that must be fixed and minor suggestions for improvement
8. If problem is not related to the PR, suggest but don't put in review criteria

IMPORTANT: Return ONLY a valid JSON object with this exact structure, 
without any markdown formatting, code blocks, or additional text:
{
  "metrics": {
    "complexity": number,
    "maintainability": number,
    "securityScore": number,
    "performanceScore": number
  },
  "issues": {
    "security": string[],
    "performance": string[]
  },
  "summary": string,
  "overallQuality": number,
  "approvalRecommended": boolean,
  "suggestions": {
    "critical": [
      {
        "category": string,
        "file": string,
        "location": string,
        "description": string
      }
    ],
    "important": [
      {
        "category": string,
        "file": string,
        "location": string,
        "description": string
      }
    ],
    "minor": [
      {
        "category": string,
        "file": string,
        "location": string,
        "description": string
      }
    ]
  },
  "usageMetadata": {
    "promptTokenCount": number,
    "candidatesTokenCount": number,
    "totalTokenCount": number
  }
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

  static parseReviewResponse(text: LlmResponse): CodeReviewResponse {
    try {
      const cleanJson = this.parseJsonResponse(text.content);
      const result = JSON.parse(cleanJson);

      if (
        !result.summary ||
        !result.metrics ||
        typeof result.metrics.complexity !== 'number' ||
        typeof result.metrics.maintainability !== 'number' ||
        typeof result.metrics.securityScore !== 'number' ||
        typeof result.metrics.performanceScore !== 'number' ||
        !result.issues ||
        !Array.isArray(result.issues.security) ||
        !Array.isArray(result.issues.performance) ||
        typeof result.overallQuality !== 'number' ||
        typeof result.approvalRecommended !== 'boolean' ||
        !Array.isArray(result.suggestions.critical) ||
        !Array.isArray(result.suggestions.important) ||
        !Array.isArray(result.suggestions.minor)
      ) {
        return {
          metrics: {
            complexity: 5,
            maintainability: 5,
            securityScore: 5,
            performanceScore: 5
          },
          issues: {
            security: [],
            performance: []
          },
          summary: text.content.slice(0, 500),
          overallQuality: 5,
          approvalRecommended: false,
          suggestions: {
            critical: [],
            important: [],
            minor: []
          },
          usageMetadata: text.usage
        };
      }

      const { metrics, issues, summary, overallQuality, approvalRecommended, suggestions } = result;

      return {
        metrics,
        issues,
        summary,
        overallQuality,
        approvalRecommended,
        suggestions,
        usageMetadata: text.usage,
      };
    } catch (error) {
      return {
        metrics: {
          complexity: 5,
          maintainability: 5,
          securityScore: 5,
          performanceScore: 5
        },
        issues: {
          security: [],
          performance: []
        },
        summary: text.content.slice(0, 500),
        overallQuality: 5,
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
          minor: []
        },
        usageMetadata: text.usage
      };
    }
  }

  static buildGeminiEndpoint(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  static mapGeminiResponse(data: GeminiResponse, model: string): LlmResponse {
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid Gemini API response structure');
    }

    return {
      content: data.candidates[0].content.parts[0].text,
      usage: {
        model,
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }
}
