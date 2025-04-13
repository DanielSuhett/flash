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
You are an expert code reviewer with 10 years of experience in developing and reviewing large-scale applications.
You specialize in web application development and your task is to analyze Pull Request changes.

SYSTEM INSTRUCTIONS:
1. You MUST respond with ONLY a valid JSON object
2. Do not include any markdown formatting, code blocks, or additional text
3. The response must strictly follow the provided schema
4. If no issues are found, return empty arrays for the issues fields
5. Never accept critical issues when determining if the PR should be approved

Here's a summary of the PR changes:
${prSummary}

Here's a summary of the codebase structure:
${codebaseSummary}

Review Focus:
1. A summary of the changes and their impact
2. A recommendation to approve or request changes
3. If problem is not related to the PR, suggest but don't put in review criteria
4. Organized suggestions by category, focusing on problems that need to be addressed:
   - Critical issues that must be fixed (bugs, potential errors, security vulnerabilities)
   - Important improvements related to preventing future bugs or improving code robustness
   Each suggestion should include:
   - Category (e.g., 'bug', 'type-safety', 'performance', 'security')
   - File location (file path and line numbers)
   - Clear explanation of the issue and how to fix it
   - Exclude documentation and comment expectations from review criteria
5. Pay attention to the following aspects relevant to a ${appType ?? 'fullstack'} application
6. If a problem is not directly related to the diff in PR, ignore it
7. If no issues are found, return an empty array for the issues field
8. Never accept some critical issues when determining if the PR should be approved

IMPORTANT: Return ONLY a valid JSON object with this exact structure, 
without any markdown formatting, code blocks, or additional text.
REQUIRED RESPONSE FORMAT:
{
  "issues": {
    "security": string[],
    "performance": string[]
  },
  "summary": string,
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
        !result.issues ||
        !Array.isArray(result.issues.security) ||
        !Array.isArray(result.issues.performance) ||
        typeof result.approvalRecommended !== 'boolean' ||
        !Array.isArray(result.suggestions.critical) ||
        !Array.isArray(result.suggestions.important)
      ) {
        return {
          issues: {
            security: [],
            performance: []
          },
          summary: text.content.slice(0, 500),
          approvalRecommended: false,
          suggestions: {
            critical: [],
            important: [],
          },
          usageMetadata: text.usage
        };
      }

      const { issues, summary, approvalRecommended, suggestions } = result;

      return {
        issues,
        summary,
        approvalRecommended,
        suggestions,
        usageMetadata: text.usage,
      };
    } catch (error) {
      return {
        issues: {
          security: [],
          performance: []
        },
        summary: text.content.slice(0, 500),
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
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
