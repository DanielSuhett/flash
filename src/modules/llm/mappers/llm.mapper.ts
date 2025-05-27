import { PullRequestInfo } from '../../../types/index.js';
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
    pullRequest: PullRequestInfo
  ): Array<{ text: string }> {
    const prSummary = this.buildPRSummary(pullRequest);
    return [
      {
        text: `
You are a senior code reviewer. Analyze this PR focusing ONLY on runtime bugs and logic errors.

RULES:
1. Only analyze modified functions and their direct dependencies
2. Only flag issues that cause runtime failures or incorrect behavior
3. No style, docs, or non-critical suggestions
4. No out-of-scope improvements
5. No "nice to have" suggestions

CRITICAL ISSUES:
- Runtime errors
- Logic bugs affecting output
- Null/undefined access
- Missing error handling
- Incorrect API usage
- Data validation gaps

OUTPUT FORMAT:
1. What changed (1-2 sentences)
2. Critical issues (if any)
3. Approval status

CHANGES:
${prSummary}`,
      }
    ];
  }

  static buildTranslationPrompt(content: string, targetLanguage: string): string {
    return `Translate this code review markdown to ${targetLanguage}.

RULES:
1. Keep technical terms in English
2. Keep code blocks unchanged
3. Keep file paths unchanged
4. Keep error messages in English
5. Reduce repetition — avoid redundant or overly descriptive comments.
6. Don't include recommendations
7. Highlight only relevant critiques — ignore style, visual organization, or non-critical suggestions.
8. Be objective and pragmatic — focus on what affects behavior, logic, maintainability, or reliability.
9. Ignore "nice to have" or out-of-scope improvements.
10. Do not overpraise — if needed, summarize positives in a single line at the end.

EXPECTED OUTPUT:
# Flash Review

## Main Changes
(Summarize the key changes introduced by the PR)

## Critical Issues
(Logic errors, runtime failures, incorrect behavior)

## Risks
(Potential fragility or areas requiring future attention)


ORIGINAL:
${content}`;
  }

  private static buildPRSummary(pullRequest: PullRequestInfo): string {
    let summary = `${pullRequest.title}\n`;
    if (pullRequest.body?.trim()) {
      summary += `${pullRequest.body}\n\n`;
    }

    for (const file of pullRequest.files) {
      summary += `\n${file.filename} (${file.status}, +${file.additions}, -${file.deletions})\n`;
      if (file.status === 'modified' && file.patch) {
        summary += `\`\`\`diff\n${file.patch}\`\`\`\n`;
      }
      if (file.status === 'added' && file.contents) {
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

  static parseReviewResponse(response: LlmResponse): CodeReviewResponse {
    try {
      const cleanJson = this.parseJsonResponse(response.content);
      const result = JSON.parse(cleanJson);

      if (
        !result.summary ||
        !result.issues ||
        !Array.isArray(result.issues.security) ||
        !Array.isArray(result.issues.performance) ||
        !Array.isArray(result.issues.typescript) ||
        typeof result.approvalRecommended !== 'boolean' ||
        !Array.isArray(result.suggestions?.critical) ||
        !Array.isArray(result.suggestions?.important)
      ) {
        return {
          issues: {
            security: [],
            performance: [],
            typescript: [],
          },
          summary: response.content.slice(0, 500),
          approvalRecommended: false,
          suggestions: {
            critical: [],
            important: [],
          },
          usageMetadata: response.usage,
        };
      }

      return {
        issues: result.issues,
        summary: result.summary,
        approvalRecommended: result.approvalRecommended,
        suggestions: result.suggestions,
        usageMetadata: response.usage,
      };
    } catch (error) {
      return {
        issues: {
          security: [],
          performance: [],
          typescript: [],
        },
        summary: response.content.slice(0, 500),
        approvalRecommended: false,
        suggestions: {
          critical: [],
          important: [],
        },
        usageMetadata: response.usage,
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
