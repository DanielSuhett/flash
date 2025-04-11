import * as core from '@actions/core';
import { ActionConfig, LlmProvider } from '../types/index.js';

export function loadActionConfig(): ActionConfig {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    llm: {
      provider: core.getInput('llm-provider', { required: true }) as LlmProvider,
      apiKey: core.getInput('llm-api-key', { required: true }),
      endpoint: core.getInput('llm-endpoint', { required: false }),
      model: core.getInput('llm-model', { required: true }),
    },
    analysis: {
      enableMetrics: core.getBooleanInput('enable-metrics', { required: false }),
      enableSecurity: core.getBooleanInput('enable-security', { required: false }),
      enablePerformance: core.getBooleanInput('enable-performance', { required: false }),
      enableDocumentation: core.getBooleanInput('enable-documentation', { required: false }),
    },
    review: {
      autoApprove: core.getBooleanInput('auto-approve', { required: false }),
      autoMerge: core.getBooleanInput('auto-merge', { required: false }),
      qualityThreshold: Number(core.getInput('quality-threshold', { required: false })) || 80,
    },
    index: {
      cacheEnabled: core.getBooleanInput('index-cache-enabled', { required: false }),
    },
  };
}
