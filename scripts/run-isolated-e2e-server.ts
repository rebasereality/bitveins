import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareE2eAttentionEnvironment } from './e2e-attention-environment.ts'

const databasePath = process.env.BITVEINS_E2E_DATABASE_PATH
const pidPath = process.env.BITVEINS_E2E_SERVER_PID_PATH
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE
const uid = process.getuid?.()
if (uid === undefined) {
  throw new Error('The isolated E2E server requires a Unix user.')
}
const socketPath = join(
  process.env.TMUX_TMPDIR || tmpdir(),
  `tmux-${uid}`,
  socketName || '',
)

if (
  !runId
  || !/^[A-Za-z0-9_-]{1,80}$/.test(runId)
  || databasePath !== `/tmp/bitveins-e2e-${runId}.sqlite`
  || pidPath !== `/tmp/bitveins-e2e-${runId}.pid`
  || socketName !== `bitveins-e2e-${runId}`
  || workspace !== `/tmp/bitveins-e2e-workspace-${runId}`
) {
  throw new Error('Refusing to start without a safely isolated E2E environment.')
}

const isolatedDatabasePath = databasePath
const isolatedPidPath = pidPath
const isolatedSocketName = socketName
const isolatedWorkspace = workspace
const isolatedConfigurationRoot = prepareE2eAttentionEnvironment(runId)
let cleaned = false

function cleanIsolatedResources() {
  if (cleaned) {
    return
  }
  cleaned = true

  spawnSync('tmux', ['-L', isolatedSocketName, 'kill-server'], {
    stdio: 'ignore',
  })

  for (const path of [
    isolatedWorkspace,
    isolatedDatabasePath,
    `${isolatedDatabasePath}-shm`,
    `${isolatedDatabasePath}-wal`,
    isolatedPidPath,
    isolatedConfigurationRoot,
    socketPath,
  ]) {
    rmSync(path, {
      force: true,
      recursive: path === isolatedWorkspace || path === isolatedConfigurationRoot,
    })
  }
}

writeFileSync(isolatedPidPath, String(process.pid), {
  encoding: 'utf8',
  mode: 0o600,
})

process.once('exit', cleanIsolatedResources)
process.once('SIGINT', () => process.exit(130))
process.once('SIGTERM', () => process.exit(143))

const configuredServerEntry = process.env.BITVEINS_E2E_SERVER_ENTRY
if (
  configuredServerEntry
  && (
    !isAbsolute(configuredServerEntry)
    || !configuredServerEntry.endsWith('/app/.output/server/index.mjs')
  )
) {
  throw new Error('BITVEINS_E2E_SERVER_ENTRY must target an absolute packaged server entry.')
}

const serverEntry = configuredServerEntry
  ? pathToFileURL(configuredServerEntry).href
  : new URL('../.output/server/index.mjs', import.meta.url).href

await import(serverEntry)
