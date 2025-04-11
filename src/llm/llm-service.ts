import * as core from '@actions/core';
import { CodeReviewResult, IndexedCodebase, PullRequestInfo, CodeReviewRequest } from '../types/index.js';

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