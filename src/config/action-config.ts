import * as core from '@actions/core';
import { ActionConfig } from '../types/index.js';

export function getActionConfig(): ActionConfig {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    llm: {
      apiKey: core.getInput('gemini-api-key', { required: true }),
      model: core.getInput('gemini-model', { required: false }) || 'gemini-2.0-flash',
      outputLanguage: core.getInput('output-language', { required: false }) || 'en',
      maxTokens: Number(core.getInput('llm-max-tokens', { required: false })) || 5000,
    },
    review: {
      autoApprove: core.getBooleanInput('auto-approve', { required: false }),
      autoMerge: core.getBooleanInput('auto-merge', { required: false }),
      qualityThreshold: Number(core.getInput('quality-threshold', { required: false })) || 7,
    },
    index: {
      cacheEnabled: core.getBooleanInput('index-cache-enabled', { required: false }),
    },
  };
}
