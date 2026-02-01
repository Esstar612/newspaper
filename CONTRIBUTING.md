# Contributing to The Newspaper

First off, thank you for considering contributing to The Newspaper! 🎉

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if applicable**
- **Include your environment details** (OS, browser, Node version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the proposed feature**
- **Explain why this enhancement would be useful**
- **List any similar features in other applications**

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** with clear, descriptive commit messages
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Ensure the build passes** (`npm run build`)
6. **Submit the pull request**

## Development Process

### Setting Up Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/newspaper.git
cd newspaper

# Install dependencies
npm install

# Create .env.local from .env.example
cp .env.example .env.local
# Add your API keys

# Start development server
npm run dev
```

### Coding Standards

- **TypeScript**: Use TypeScript for all new files
- **Formatting**: Run `npm run format` before committing
- **Linting**: Ensure `npm run lint` passes
- **Naming**: Use descriptive variable and function names
- **Comments**: Add comments for complex logic

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add user authentication
fix: resolve weather API timeout issue
docs: update installation instructions
style: format code with prettier
refactor: restructure news fetching logic
test: add tests for article deduplication
chore: update dependencies
```

### Branch Naming

Use descriptive branch names:

```
feature/user-authentication
fix/weather-api-timeout
docs/update-readme
refactor/news-fetching
```

## Project Structure

```
app/                 # Next.js app directory
├── api/            # API routes
├── news/           # News page
├── stocks/         # Stocks page
└── weather/        # Weather page
components/         # Reusable components
lib/               # Utility functions
models/            # Database models
public/            # Static assets
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Questions?

Feel free to open an issue with the `question` label, or reach out directly!

Thank you for contributing! 🙏