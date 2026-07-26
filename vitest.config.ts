import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'cli/core/**/*.ts',
        'app/terminal/**/*.ts',
        'app/utils/**/*.ts',
        'shared/contracts/**/*.ts',
        'shared/security/**/*.ts',
        'server/modules/dropzones/application/**/*.ts',
        'server/modules/dropzones/model/**/*.ts',
        'server/modules/dropzones/adapters/**/*.ts',
        'server/modules/explorer/application/**/*.ts',
        'server/modules/explorer/model/**/*.ts',
        'server/modules/explorer/adapters/**/*.ts',
        'server/modules/files/delivery/**/*.ts',
        'server/modules/history/application/history-service.ts',
        'server/modules/history/model/**/*.ts',
        'server/modules/history/adapters/drizzle-history-repository.ts',
        'server/modules/sessions/application/session-service.ts',
        'server/modules/sessions/model/**/*.ts',
        'server/modules/sessions/delivery/**/*.ts',
        'server/modules/sessions/adapters/tmux/tmux-cli-adapter.ts',
        'server/modules/terminal/application/terminal-peer-registry.ts',
        'server/modules/terminal/application/terminal-peer-session.ts',
        'server/utils/api-security.ts',
        'server/utils/request-validation.ts',
        'server/utils/workspace-path.ts',
      ],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
})
