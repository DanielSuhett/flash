import { PullRequestInfo, MarkdownCodebase } from '../../../types/index.js';
import { CodeReviewResponse, GeminiResponse, LlmResponse } from '../entities/index.js';

export class LlmMapper {
  static getSystemInstruction(): string {
    return `You are an expert TypeScript code reviewer with 10 years of experience in developing 
    and reviewing large-scale applications. You specialize in web application development and TypeScript type system.
  
  SYSTEM INSTRUCTIONS:
  1. You MUST respond with ONLY a valid JSON object.
  2. Do not include any markdown formatting, code blocks, or additional text outside the JSON structure.
  3. The response must strictly follow the provided schema.
  4. If no issues are found, return empty arrays for the 'issues' fields and relevant empty arrays within 'suggestions'.
  5. Never recommend approval if critical issues are found. Base the 'approvalRecommended' boolean on this rule.
  6. Pay special attention to TypeScript-specific issues:
     - Type compatibility
     - Interface implementations
     - Generic type parameters
     - Type assertions and type guards
     - Union and intersection types
     - Strict null checks
     - Type inference issues
     - Module import/export consistency
  
  IMPORTANT: Return ONLY a valid JSON object with this exact structure,
  without any markdown formatting, code blocks, or additional text.
  
  REQUIRED RESPONSE FORMAT:
  {
    "issues": {
      "security": string[],
      "performance": string[],
      "typescript": string[]
    },
    "summary": string,
    "approvalRecommended": boolean,
    "suggestions": {
      "critical": [
        {
          "category": string,
          "file": string,
          "location": string,
          "description": string,
          "typeIssue": boolean
        }
      ],
      "important": [
        {
          "category": string,
          "file": string,
          "location": string,
          "description": string,
          "typeIssue": boolean
        }
      ]
    }
  }`;
  }

  static buildReviewPrompt(
    markdownCodebase: MarkdownCodebase,
    pullRequest: PullRequestInfo,
    appType: string
  ): Array<{ text: string }> {
    const prSummary = this.buildPRSummary(pullRequest);
    return [
      {
        text: `
You are a senior code reviewer. Analyze this PR focusing ONLY on runtime bugs and logic errors.

## Review Structure:
1. **Change Analysis**: Explain WHAT changed, WHY it changed, and HOW it impacts the system
2. **Critical Runtime Issues**: Bugs that will cause runtime failures or incorrect behavior
3. **Logic Validation**: Verify business logic correctness within the context of changes
4. **Approval Recommendation**: Approve only if no critical issues exist

## Focus Areas (${appType ?? 'fullstack'} application):
**CRITICAL ISSUES (must fix before approval):**
- Runtime errors and exceptions
- Logic bugs that produce incorrect results
- Null/undefined access without proper validation
- Missing error handling for critical paths
- Missing function implementations or undefined references
- Incorrect API usage or parameter passing
- Data validation gaps that could cause failures

**IGNORE (not review criteria):**
- Code style and formatting
- Documentation quality
- Performance optimizations (unless causing bugs)
- Type 'any' usage
- Code organization preferences

## Validation Requirements:
- Verify input validation exists where needed
- Check error boundaries and fallback handling  
- Ensure async operations handle failures properly
- Validate data transformations are correct
- Confirm edge cases are handled

## Output Requirements:
- Clearly explain WHAT each change does
- Justify WHY each change was necessary
- Describe HOW it affects system behavior
- Only flag issues that cause runtime problems or logic errors
- Provide specific file locations and line numbers for issues
- If no critical issues found, approve the PR
`,
      },
      {
        text: `Here's a summary of the PR changes:
    ${prSummary}`,
      },
      {
        text: `Here's the codebase structure context:
    ${markdownCodebase.content}`,
      },
    ];
  }

  static buildTranslationPrompt(content: string, targetLanguage: string): string {
    return `Translate the following text to ${targetLanguage}. Keep all code blocks, markdown formatting, and technical terms in English. Only translate the natural language parts:

${content}`;
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
      summary += `\nChanges in this file:\n`;
      if (file.patch) {
        summary += `\`\`\`diff\n${file.patch}\`\`\`\n`;
      }
      summary += `\nContent in this file:\n`;
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
        !Array.isArray(result.issues.typescript) ||
        typeof result.approvalRecommended !== 'boolean' ||
        !Array.isArray(result.suggestions.critical) ||
        !Array.isArray(result.suggestions.important)
      ) {
        return {
          issues: {
            security: [],
            performance: [],
            typescript: [],
          },
          summary: text.content.slice(0, 500),
          approvalRecommended: false,
          suggestions: {
            critical: [],
            important: [],
          },
          usageMetadata: text.usage,
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
          performance: [],
          typescript: [],
        },
        summary: text.content.slice(0, 500),
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: text.usage,
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
