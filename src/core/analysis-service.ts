import { AnalysisConfig, CodeMetrics, ReviewResult } from '../types/config.js'
import { IndexedCodebase } from '../types/index.js'
import { LlmService } from '../llm/llm-service.js'

export class AnalysisService {
  constructor(
    private config: AnalysisConfig,
    private llmService: LlmService
  ) {}

  async analyzeCodebase(codebase: IndexedCodebase): Promise<ReviewResult> {
    const metrics = await this.calculateMetrics(codebase)
    const securityIssues = this.config.enableSecurity ? await this.checkSecurity(codebase) : []
    const performanceIssues = this.config.enablePerformance ? await this.checkPerformance(codebase) : []
    const documentationIssues = this.config.enableDocumentation ? await this.checkDocumentation(codebase) : []
    const testCoverageIssues = this.config.enableTestCoverage ? await this.checkTestCoverage(codebase) : []

    const summary = await this.generateSummary(metrics, {
      securityIssues,
      performanceIssues,
      documentationIssues,
      testCoverageIssues
    })

    return {
      summary,
      suggestions: this.generateSuggestions(metrics, {
        securityIssues,
        performanceIssues,
        documentationIssues,
        testCoverageIssues
      }),
      metrics,
      securityIssues,
      performanceIssues,
      documentationIssues,
      testCoverageIssues
    }
  }

  private async calculateMetrics(codebase: IndexedCodebase): Promise<CodeMetrics> {
    const prompt = `Analyze the following codebase and provide metrics for:
1. Code complexity (1-10)
2. Maintainability score (1-10)
3. Test coverage percentage
4. Documentation coverage percentage
5. Security score (1-10)
6. Performance score (1-10)

Codebase:
${JSON.stringify(codebase, null, 2)}`

    const response = await this.llmService.generateContent(prompt)
    const metrics = JSON.parse(response.content)

    return {
      complexity: metrics.complexity,
      maintainability: metrics.maintainability,
      testCoverage: metrics.testCoverage,
      documentationCoverage: metrics.documentationCoverage,
      securityScore: metrics.securityScore,
      performanceScore: metrics.performanceScore
    }
  }

  private async checkSecurity(codebase: IndexedCodebase): Promise<string[]> {
    const prompt = `Analyze the following codebase for security vulnerabilities and provide a list of issues found:

Codebase:
${JSON.stringify(codebase, null, 2)}`

    const response = await this.llmService.generateContent(prompt)
    return JSON.parse(response.content)
  }

  private async checkPerformance(codebase: IndexedCodebase): Promise<string[]> {
    const prompt = `Analyze the following codebase for performance issues and provide a list of potential bottlenecks:

Codebase:
${JSON.stringify(codebase, null, 2)}`

    const response = await this.llmService.generateContent(prompt)
    return JSON.parse(response.content)
  }

  private async checkDocumentation(codebase: IndexedCodebase): Promise<string[]> {
    const prompt = `Analyze the following codebase for documentation completeness and provide a list of missing or inadequate documentation:

Codebase:
${JSON.stringify(codebase, null, 2)}`

    const response = await this.llmService.generateContent(prompt)
    return JSON.parse(response.content)
  }

  private async checkTestCoverage(codebase: IndexedCodebase): Promise<string[]> {
    const prompt = `Analyze the following codebase for test coverage gaps and provide a list of areas that need additional testing:

Codebase:
${JSON.stringify(codebase, null, 2)}`

    const response = await this.llmService.generateContent(prompt)
    return JSON.parse(response.content)
  }

  private async generateSummary(
    metrics: CodeMetrics,
    issues: {
      securityIssues: string[]
      performanceIssues: string[]
      documentationIssues: string[]
      testCoverageIssues: string[]
    }
  ): Promise<string> {
    const prompt = `Generate a summary of the code review based on the following metrics and issues:

Metrics:
${JSON.stringify(metrics, null, 2)}

Issues:
${JSON.stringify(issues, null, 2)}`

    const response = await this.llmService.generateContent(prompt)
    return response.content
  }

  private generateSuggestions(
    metrics: CodeMetrics,
    issues: {
      securityIssues: string[]
      performanceIssues: string[]
      documentationIssues: string[]
      testCoverageIssues: string[]
    }
  ): string[] {
    const suggestions: string[] = []

    if (metrics.complexity > 7) {
      suggestions.push('Consider refactoring to reduce code complexity')
    }

    if (metrics.maintainability < 6) {
      suggestions.push('Improve code maintainability by following best practices')
    }

    if (metrics.testCoverage < 80) {
      suggestions.push('Increase test coverage to improve code reliability')
    }

    if (metrics.documentationCoverage < 80) {
      suggestions.push('Add more documentation to improve code understanding')
    }

    if (metrics.securityScore < 8) {
      suggestions.push('Address security vulnerabilities to improve security score')
    }

    if (metrics.performanceScore < 8) {
      suggestions.push('Optimize code to improve performance')
    }

    return suggestions
  }
} 