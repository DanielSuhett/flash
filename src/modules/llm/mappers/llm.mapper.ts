import { PullRequestInfo } from '../../../types/index.js';
import { GeminiResponse, LlmResponse, PullRequestSummaryResponse } from '../entities/index.js';

export class LlmMapper {
  static getSummarySystemInstruction(outputLanguage: string = 'en'): string {
    const languageInstruction = outputLanguage === 'en' ? '' : `Respond in ${outputLanguage}.`;

    return `You are an expert TypeScript developer analyzing pull requests. 
    
    Create a concise technical summary focusing ONLY on:
    - What this PR accomplishes (based on title and changes)
    - Key technical implementation details from the actual code changes
    - Files modified and their purpose
    - New features, refactorings, or bug fixes implemented
    
    Be direct and technical. Ignore any code not directly changed in the PR.
    Do not mention code review, approval, or issues.
    ${languageInstruction}
    
    Respond with plain markdown text, not JSON.`;
  }

  static getSystemInstruction(): string {
    return `You are an expert TypeScript code reviewer with 10 years of experience in developing 
    and reviewing large-scale applications. You specialize in web application development and TypeScript type system.
  
  SYSTEM INSTRUCTIONS:
  1. You MUST respond with ONLY a valid JSON object.
  2. Do not include any markdown formatting, code blocks, or additional text outside the JSON structure.
  3. The response must strictly follow the provided schema.
  4. Focus on creating a concise technical summary of the PR changes and their impact.
  5. Include implementation details, architectural decisions, and technical patterns used.
  
  IMPORTANT: Return ONLY a valid JSON object with this exact structure,
  without any markdown formatting, code blocks, or additional text.
  
  REQUIRED RESPONSE FORMAT:
  {
    "summary": string
  }`;
  }

  static buildSummaryPrompt(
    pullRequest: PullRequestInfo,
    commitMessages: string[] = []
  ): Array<{ text: string }> {
    const prSummary = this.buildPRSummary(pullRequest);

    const commitsSection = commitMessages.length
      ? `Recent commit messages:\n${commitMessages.map((m) => `- ${m}`).join('\n')}`
      : '';

    const filesSection = pullRequest.files
      .map((file) => `- ${file.filename} (${file.status}, +${file.additions}, -${file.deletions})`)
      .join('\n');

    const header = `Title: ${pullRequest.title}\n\nChanged files:\n${filesSection}`;

    return [
      {
        text: `Analyze the following GitHub pull request.

${header}

${commitsSection}

${prSummary}

Provide a concise technical summary focusing on purpose, implementation details and potential impact.`,
      },
    ];
  }

  private static buildPRSummary(pullRequest: PullRequestInfo): string {
    const MAX_PATCH_LINES = 120;

    let summary = '';

    if (pullRequest.body?.trim()) {
      summary += `${pullRequest.body}\n\n`;
    }

    for (const file of pullRequest.files) {
      summary += `\n${file.filename} (${file.status}, +${file.additions}, -${file.deletions})\n`;

      if (file.status === 'modified' && file.patch) {
        const lines = file.patch.split('\n');
        const trimmedPatch =
          lines.length > MAX_PATCH_LINES
            ? [...lines.slice(0, MAX_PATCH_LINES / 2), '...', ...lines.slice(-MAX_PATCH_LINES / 2)].join('\n')
            : file.patch;

        summary += `\`\`\`diff\n${trimmedPatch}\n\`\`\`\n`;
      }

      if (file.status === 'added' && file.contents) {
        const codeLines = file.contents.split('\n');
        const trimmedContent =
          codeLines.length > MAX_PATCH_LINES
            ? [...codeLines.slice(0, MAX_PATCH_LINES / 2), '...', ...codeLines.slice(-MAX_PATCH_LINES / 2)].join('\n')
            : file.contents;

        summary += `\`\`\`typescript\n${trimmedContent}\n\`\`\`\n`;
      }
    }

    return summary;
  }

  static parseSummaryResponse(text: LlmResponse): PullRequestSummaryResponse {
    return {
      summary: text.content.trim(),
      usageMetadata: text.usage,
    };
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
