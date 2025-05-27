import * as core from '@actions/core';
import * as github from '@actions/github';
import { WorkflowService } from './core/workflow-service.js';
import { getActionConfig } from './config/action-config.js';

async function run(): Promise<void> {
  try {
    const config = getActionConfig();
    const context = github.context;
    const { owner, repo } = context.repo;
    let prNumber: number | undefined;

    if (context.eventName === 'pull_request') {
      prNumber = context.payload.pull_request?.number;
      if (!prNumber) {
        throw new Error('PR number not found in context');
      }
    } else if (context.eventName === 'workflow_dispatch') {
      const inputPrNumber = core.getInput('pr-number');

      if (!inputPrNumber) {
        throw new Error('PR number is required for manual triggering');
      }
      prNumber = parseInt(inputPrNumber, 10);
      if (isNaN(prNumber)) {
        throw new Error('Invalid PR number provided');
      }
    } else {
      throw new Error(
        'This action can only be triggered by pull_request or workflow_dispatch events'
      );
    }

    const workflowService = new WorkflowService(config);

    await workflowService.processReview(owner, repo, prNumber);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
