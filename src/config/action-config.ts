import * as core from '@actions/core';
import { ActionConfig } from '../types/index.js';

export function getActionConfig(): ActionConfig {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    llm: {
      apiKey: core.getInput('gemini-api-key', { required: true }),
      model: core.getInput('gemini-model', { required: false }) || 'gemini-2.5-flash',
      outputLanguage: core.getInput('output-language', { required: false }) || 'en',
      maxTokens: Number(core.getInput('llm-max-tokens', { required: false })) || 5000,
    }
  };
}
