# Contributing to Bitveins

Thank you for your interest in contributing to Bitveins! We welcome bug reports, feature suggestions, and code contributions.

## Prerequisites

- **Node.js**: v24.13.0 (see `.node-version`)
- **pnpm**: v10.33.2 (pinned by `packageManager`)
- **tmux**: v3.1 or newer, available in PATH
- Native build tools (for `node-pty`)

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rebasereality/bitveins.git
   cd bitveins
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Create local development credentials**:

   ```bash
   cp .env.example .env
   pnpm build:cli
   pnpm bitveins hash-password
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

   Put the generated hash in `BITVEINS_AUTH_PASSWORD_HASH` and the random
   secret in `NUXT_SESSION_PASSWORD`. Keep `.env` out of source control.

4. **Start local development server**:
   ```bash
   pnpm dev
   ```
   Open `http://localhost:3000` in your browser.

The public installation uses release artifacts and the `bitveins` CLI. pnpm is
only part of the contributor workflow.

## Quality Standards & Guidelines

Before submitting a Pull Request, please ensure:

1. **All tests pass**:
   ```bash
   pnpm test
   ```
2. **Coverage thresholds pass**:
   ```bash
   pnpm test:coverage
   ```
3. **Typecheck passes without errors**:
   ```bash
   pnpm typecheck
   ```
4. **Linter checks pass**:
   ```bash
   pnpm lint
   ```
5. **File Size Rule**: Keep individual source files under **500 lines**. If a file grows beyond 500 lines, extract composables, child components, or helper modules.

6. **Native release dry-run**:

   ```bash
   pnpm build:release
   pnpm verify:release
   ```

## Submitting Pull Requests

1. Fork the repo and create your branch from `master` (e.g. `feat/my-feature` or `fix/my-bugfix`).
2. Make clean, focused commits with descriptive commit messages.
3. Ensure all tests and typechecks pass.
4. Open a Pull Request with a summary of changes and test steps.
