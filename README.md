# TypeScript Deep Code Review GitHub Action

A GitHub Action that performs deep code review on Pull Requests for TypeScript applications. This action indexes the entire codebase, leverages Google's Gemini AI to provide insightful feedback beyond basic linting.

## Features

- **Full Codebase Indexing**: Analyzes the TypeScript codebase structure to provide context-aware reviews
- **Gemini-Powered Code Analysis**: Uses Google's Gemini AI to identify potential issues beyond basic linting
- **Smart Indexing**: Prioritizes files changed in the PR and their dependencies for efficient analysis
- **Configurable Automation**: Optional auto-approve and auto-merge capabilities based on review results
- **Detailed Feedback**: Provides structured, actionable feedback with line-specific comments

## Setup

### Prerequisites

- A GitHub repository with TypeScript code
- A Google Gemini API key

### Usage

Add the following workflow to your repository (e.g., `.github/workflows/code-review.yml`):

```yaml
name: TypeScript Deep Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - '**.ts'
      - '**.tsx'

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: TypeScript Deep Code Review
        uses: projectr/ts-deep-code-review@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          llm-api-key: ${{ secrets.LLM_API_KEY }}
          auto-approve: 'false'
          auto-merge: 'false'
          index-cache-enabled: 'true'
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | N/A |
| `llm-api-key` | API key for Google Gemini | Yes | N/A |
| `llm-model` | Gemini model to use | No | `gemini-2.0-flash` |
| `auto-approve` | Whether to automatically approve PRs based on Gemini analysis | No | `false` |
| `auto-merge` | Whether to automatically merge approved PRs | No | `false` |
| `index-cache-enabled` | Whether to cache the indexed codebase between runs | No | `true` |
| `pr-number` | PR number (for manual triggering) | No | N/A |

## How It Works

1. **Smart Indexing**: The action intelligently indexes the TypeScript codebase, prioritizing files changed in the PR and their dependencies
2. **Deep Analysis**: Gemini analyzes the PR changes in the context of the broader codebase structure
3. **Feedback**: A detailed review is posted as a comment on the PR, including specific issues and recommendations
4. **Automation**: If configured and criteria are met, the action can automatically approve and merge the PR

## Customizing the Gemini Prompt

The action constructs a prompt that includes:
- A condensed representation of the codebase structure
- The PR changes with diffs
- Instructions for analysis

You can customize the prompt by modifying `src/llm/llm-service.ts`.

## Development

### Prerequisites

- Node.js 16+
- npm

### Setup

```bash
git clone https://github.com/projectr/ts-deep-code-review.git
cd ts-deep-code-review
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Future Enhancements

Planned features for future versions:
- Jira integration for ticket verification
- More advanced codebase indexing and analysis
- Custom rules and guidelines support
- Enhanced change impact analysis

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 