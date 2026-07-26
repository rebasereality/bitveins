import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/cli/**/*.test.ts',
      'tests/scripts/release/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage-cli',
      include: [
        'cli/**/*.ts',
        'scripts/release/**/*.ts',
      ],
      exclude: [
        // This file only forwards process arguments to the tested composition root.
        'cli/index.ts',
        // Type-only ports have no executable behavior to cover.
        'cli/ports/**/*.ts',
        'cli/presentation/cli-command.ts',
        'tests/**',
      ],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
        ['cli/application/installation/installation-transaction.ts']: {
          branches: 90,
          functions: 95,
          lines: 95,
          perFile: true,
          statements: 95,
        },
        ['cli/core/environment-file.ts']: {
          branches: 90,
          functions: 95,
          lines: 95,
          perFile: true,
          statements: 95,
        },
        ['cli/platform/github-release-source.ts']: {
          branches: 90,
          functions: 95,
          lines: 95,
          perFile: true,
          statements: 95,
        },
        ['cli/platform/secure-filesystem.ts']: {
          branches: 90,
          functions: 95,
          lines: 95,
          perFile: true,
          statements: 95,
        },
        ['cli/platform/sigstore-release-provenance-verifier.ts']: {
          branches: 90,
          functions: 95,
          lines: 95,
          perFile: true,
          statements: 95,
        },
      },
    },
  },
})
