import { createServer } from 'node:net'
import { defineConfig, devices } from '@playwright/test'

async function findAvailableLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate an isolated E2E port.'))
        return
      }
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

const configuredRunId = process.env.BITVEINS_E2E_RUN_ID
if (configuredRunId && !/^[A-Za-z0-9_-]{1,80}$/.test(configuredRunId)) {
  throw new Error('BITVEINS_E2E_RUN_ID contains unsupported characters.')
}
const e2eRunId = configuredRunId ?? `${process.pid}-${Date.now()}`
const configuredE2ePort = Number(process.env.BITVEINS_E2E_PORT)
const e2ePort = Number.isSafeInteger(configuredE2ePort) && configuredE2ePort > 0
  ? configuredE2ePort
  : await findAvailableLoopbackPort()
const e2eSocketName = `bitveins-e2e-${e2eRunId}`
const e2eDatabasePath = `/tmp/bitveins-e2e-${e2eRunId}.sqlite`
const e2eServerPidPath = `/tmp/bitveins-e2e-${e2eRunId}.pid`
const e2eWorkspace = `/tmp/bitveins-e2e-workspace-${e2eRunId}`
const externalServer = process.env.BITVEINS_E2E_EXTERNAL_SERVER === '1'
const webServer = externalServer
  ? undefined
  : {
      command: 'node scripts/run-isolated-e2e-server.ts',
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        NUXT_SESSION_PASSWORD: 'ci-only-session-secret-with-at-least-32-characters',
        NUXT_SESSION_COOKIE_SECURE: 'false',
        PORT: String(e2ePort),
        BITVEINS_ALLOWED_ORIGINS: `http://127.0.0.1:${e2ePort}`,
        BITVEINS_AUTH_PASSWORD_HASH: '$scrypt$n=16384,r=8,p=1$gBJh+RfZmL0WCKMY8mD12Q$/MGcwEHKloyZMmolFZgFrHtKatncAWMy0nWlhKGSdVVKRScci2V94VnBpJtmh4Tio3TDjdCqHUq8Ga6V0FtjKA',
        BITVEINS_DATABASE_PATH: e2eDatabasePath,
        BITVEINS_TMUX_SOCKET_NAME: e2eSocketName,
      },
      reuseExistingServer: false,
      url: `http://127.0.0.1:${e2ePort}/api/auth/session`,
    }

process.env.BITVEINS_E2E_RUN_ID = e2eRunId
process.env.BITVEINS_E2E_PORT = String(e2ePort)
process.env.BITVEINS_E2E_TMUX_SOCKET_NAME = e2eSocketName
process.env.BITVEINS_E2E_DATABASE_PATH = e2eDatabasePath
process.env.BITVEINS_E2E_SERVER_PID_PATH = e2eServerPidPath
process.env.BITVEINS_E2E_WORKSPACE = e2eWorkspace

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  webServer,
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile-*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: '**/mobile-*.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
