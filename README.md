# Flash ✨
<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-✓-blue.svg)](https://github.com/features/actions)

</div>

A powerful GitHub Action that performs deep code review on TypeScript Pull Requests using Google's Gemini AI. This action provides intelligent, context-aware code analysis and automated review capabilities.

## 🚀 Features

- **Intelligent Code Analysis**: Leverages Google's Gemini AI for deep code understanding
- **Smart Indexing**: Efficiently indexes and analyzes TypeScript codebases
- **Context-Aware Reviews**: Considers the broader codebase context for better insights
- **Automated Workflow**: Seamless integration with GitHub Actions
- **Configurable Review Process**: Customize review parameters and thresholds
- **Multi-language Support**: Review comments in multiple languages
- **Token Usage Tracking**: Monitor and optimize AI token consumption

## 📋 Prerequisites

- GitHub repository with TypeScript code
- Google Gemini API key

## 🛠️ Installation

1. Add the action to your repository's workflow:

```yaml
name: Flash Review

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
        uses: DanielSuhett/flash@v0.0.9
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          gemini-model: 'gemini-2.0-flash'
          llm-max-tokens: 5000
          output-language: 'en'
          auto-approve: 'false'
          index-cache-enabled: 'true'
```

## ⚙️ Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | - |
| `gemini-api-key` | Google Gemini API key | Yes | - |
| `gemini-model` | Gemini model version | No | `gemini-2.0-flash` |
| `llm-max-tokens` | Maximum tokens for review | No | `5000` |
| `output-language` | Review output language | No | `en` |
| `auto-approve` | Auto-approve PRs | No | `false` |
| `index-cache-enabled` | Enable codebase caching | No | `true` |
| `pr-number` | PR number for manual trigger | No | - |

## 🔧 Development

### Setup

```bash
git clone https://github.com/projectr/Flash.git
cd Flash
pnpm install
```

### Build

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Linting

```bash
pnpm lint
pnpm lint:fix
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
