import * as core from '@actions/core';
import { ActionConfig } from '../types/index.js';

export function loadActionConfig(): ActionConfig {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    llmApiKey: core.getInput('llm-api-key', { required: true }),
    llmEndpoint: core.getInput('llm-endpoint', { required: false }) || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    autoApprove: core.getBooleanInput('auto-approve', { required: false }),
    autoMerge: core.getBooleanInput('auto-merge', { required: false }),
    indexCacheEnabled: core.getBooleanInput('index-cache-enabled', { required: false })
  };
} 