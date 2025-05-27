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
1. **Function Analysis**: Analyze ONLY the functions directly related to the changes
2. **Critical Runtime Issues**: Bugs that will cause runtime failures or incorrect behavior
3. **Logic Validation**: Verify business logic correctness within the context of changed functions
4. **Approval Recommendation**: Approve only if no critical issues exist

## Focus Areas (${appType ?? 'fullstack'} application):
**CRITICAL ISSUES (must fix before approval):**
- Runtime errors and exceptions in modified functions
- Logic bugs that produce incorrect results
- Null/undefined access without proper validation
- Missing error handling for critical paths
- Missing function implementations or undefined references
- Incorrect API usage or parameter passing
- Data validation gaps that could cause failures

**IGNORE:**
- Code style and formatting
- Documentation quality
- Performance optimizations (unless causing bugs)
- Type 'any' usage
- Code organization preferences
- Functions not directly related to changes
- Imported files that aren't modified
- Test files and configurations

## Function Analysis Requirements:
- Only analyze functions that are:
  1. Directly modified in the PR
  2. Called by modified functions
  3. Calling the modified functions
- For each relevant function:
  1. Verify input validation exists where needed
  2. Check error boundaries and fallback handling
  3. Ensure async operations handle failures properly
  4. Validate data transformations are correct
  5. Confirm edge cases are handled

## Output Requirements:
- For each analyzed function:
  1. Explain WHAT the function does
  2. Justify WHY the changes were necessary
  3. Describe HOW it affects system behavior
- Only flag issues that cause runtime problems or logic errors
- Provide specific file locations and line numbers for issues
- If no critical issues found in analyzed functions, approve the PR

## Changes to Review:
${prSummary}`,
      }
    ];
  }

  static buildTranslationPrompt(content: string, targetLanguage: string): string {
    return `You are a senior code reviewer. Based on the following code review, generate a comprehensive markdown document in ${targetLanguage}.

IMPORTANT GUIDELINES:
1. Structure the document with these sections:
   - Summary of changes
   - Critical issues (if any)
   - Important improvements
   - Technical details
   - Impact analysis
   - Recommendations

2. FORMAT RULES:
   - Keep all code blocks, file paths, and technical terms in English
   - Use markdown formatting for better readability
   - Use emojis appropriately to highlight important points
   - Keep the Flash Review watermark in English

3. CONTENT RULES:
   - Maintain all technical information from the original review
   - Explain issues and suggestions clearly in ${targetLanguage}
   - Include file locations and code references as is
   - Keep error messages and code snippets in English
   - Preserve all critical and important suggestions
   - Add context that would be helpful for ${targetLanguage} speakers

ORIGINAL REVIEW:
${content}

Generate a well-structured, professional review in ${targetLanguage} that maintains all technical accuracy while being culturally appropriate.`;
  }
  private static buildPRSummary(pullRequest: PullRequestInfo): string {
    let summary = `Title: ${pullRequest.title}\n`;
    if (pullRequest.body) {
      summary += `Description: ${pullRequest.body}\n\n`;
    }

    for (const file of pullRequest.files) {
      summary += `\nFile: ${file.filename} (${file.status}, +${file.additions}, -${file.deletions})\n`;
      
      if (file.status === 'modified' && file.patch) {
        summary += `Changes:\n\`\`\`diff\n${file.patch}\`\`\`\n`;
      }
      
      if (file.status === 'added' && file.contents) {
        summary += `New File Content:\n\`\`\`typescript\n${file.contents}\`\`\`\n`;
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
