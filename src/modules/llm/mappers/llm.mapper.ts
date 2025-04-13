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
You have 10 years of experience in developing and reviewing large-scale applications.
You are specializing in web application development and your task is to analyze Pull Request changes:

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

IMPORTANT: You MUST follow this schema, return ONLY a valid JSON object with this exact structure, 
without any markdown formatting, code blocks, or additional text:

See example response:
{
  "issues": {
    "security": ["Potential XSS vulnerability in user input handling"] // if no issues, return empty array
    "performance": ["Inefficient database query in UserService"] // if no issues, return empty array
  },
  "summary": "This PR implements user authentication with proper security measures",
  "approvalRecommended": true,
  "suggestions": {
    "critical": [
      {
        "category": "security",
        "file": "src/auth/auth.service.ts",
        "location": "line 45",
        "description": "Password hash should use a stronger algorithm"
      }
    ],
    "important": [
      {
        "category": "performance",
        "file": "src/user/user.service.ts",
        "location": "line 23",
        "description": "Consider adding an index to improve query performance"
      }
    ]
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
      const defaultResponse = {
        issues: {
          security: [],
          performance: [],
        },
        summary: 'Failed to parse LLM response',
        approvalRecommended: true,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: text.usage,
      };

      if (!result || typeof result !== 'object') {
        return defaultResponse;
      }

      const { issues, summary, approvalRecommended, suggestions } = result;

      return {
        issues,
        summary,
        approvalRecommended: approvalRecommended == 'true' ? true : false,
        suggestions,
        usageMetadata: text.usage,
      };
    } catch (error) {
      const errorResponse = {
        issues: {
          security: [],
          performance: [],
        },
        summary: `Error parsing LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: text.usage,
      };

      return errorResponse;
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
