import { AnalysisConfig, CodeMetrics, ReviewResult } from '../types/config.js';
import { IndexedCodebase } from '../types/index.js';
import { LlmService } from '../llm/llm-service.js';

interface AnalysisResponse {
  metrics: {
    complexity: number;
    maintainability: number;
    securityScore: number;
    performanceScore: number;
  };
  issues: {
    security: string[];
    performance: string[];
  };
  summary: string;
}

export class AnalysisService {
  constructor(
    private config: AnalysisConfig,
    private llmService: LlmService
  ) {}

  async analyzeCodebase(codebase: IndexedCodebase): Promise<ReviewResult> {
    const analysis = await this.performAnalysis(codebase);

    return {
      summary: analysis.summary,
      suggestions: this.generateSuggestions(analysis.metrics, analysis.issues),
      metrics: analysis.metrics,
      securityIssues: this.config.enableSecurity ? analysis.issues.security : [],
      performanceIssues: this.config.enablePerformance ? analysis.issues.performance : [],
    };
  }

  private async performAnalysis(codebase: IndexedCodebase): Promise<AnalysisResponse> {
    const codebaseSummary = this.buildCodebaseSummary(codebase);
    const prompt = `Analyze the following TypeScript codebase and provide a comprehensive review with metrics and issues.

Codebase Structure:
${codebaseSummary}

Please provide a detailed analysis with the following structure:
1. Code Metrics (all scores from 0-10):
   - Complexity score
   - Maintainability score
   - Security score
   - Performance score

2. Issues found:
   - Security vulnerabilities
   - Performance bottlenecks

3. A summary of the overall code quality and recommendations

IMPORTANT: Return ONLY a valid JSON object with this exact structure:
{
  "metrics": {
    "complexity": number,
    "maintainability": number,
    "securityScore": number,
    "performanceScore": number
  },
  "issues": {
    "security": string[],
    "performance": string[],
  },
  "summary": string
}`;

    const response = await this.llmService.generateContent(prompt);

    return JSON.parse(response.content);
  }

  private buildCodebaseSummary(codebase: IndexedCodebase): string {
    const summary: string[] = [];

    for (const file of codebase.files) {
      const declarations = file.declarations
        .map((decl) => {
          const deps = decl.dependencies?.length ? `[deps:${decl.dependencies.join(',')}]` : '';

          return `${decl.type}:${decl.name}${decl.exported ? ':exported' : ''}${deps}`;
        })
        .join(';');

      summary.push(`${file.path}|${declarations}`);
    }

    const dependencies = Object.entries(codebase.dependencies)
      .map(([key, deps]) => `${key}:${deps.join(',')}`)
      .join(';');

    const imports = Object.entries(codebase.imports)
      .map(([key, imps]) => `${key}:${imps.join(',')}`)
      .join(';');

    return ['FILES:', summary.join('\n'), 'DEPENDENCIES:', dependencies, 'IMPORTS:', imports].join(
      '\n'
    );
  }

  private generateSuggestions(
    metrics: CodeMetrics,
    _issues: {
      security: string[];
      performance: string[];
    }
  ): string[] {
    const suggestions: string[] = [];

    if (metrics.complexity > 10) {
      suggestions.push('Consider refactoring complex functions to improve readability');
    }

    if (metrics.maintainability < 8) {
      suggestions.push('Improve code organization to enhance maintainability');
    }

    if (metrics.securityScore < 8) {
      suggestions.push('Address security vulnerabilities to improve code safety');
    }

    if (metrics.performanceScore < 8) {
      suggestions.push('Optimize performance bottlenecks to improve code efficiency');
    }

    return suggestions;
  }
}
