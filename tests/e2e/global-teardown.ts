import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 30 && isRunning(pid); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  if (isRunning(pid)) {
    throw new Error(`Isolated E2E server ${pid} did not stop after SIGTERM.`)
  }
}

async function isIsolatedServer(pid: number): Promise<boolean> {
  const result = await execFileAsync('ps', [
    '-p',
    String(pid),
    '-o',
    'command=',
  ]).catch(() => null)
  return Boolean(result?.stdout.includes('scripts/run-isolated-e2e-server.ts'))
}

export default async function globalTeardown(): Promise<void> {
  const databasePath = process.env.BITVEINS_E2E_DATABASE_PATH
  const pidPath = process.env.BITVEINS_E2E_SERVER_PID_PATH
  const runId = process.env.BITVEINS_E2E_RUN_ID
  const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
  const workspace = process.env.BITVEINS_E2E_WORKSPACE

  if (
    !runId
    || !/^[A-Za-z0-9_-]{1,80}$/.test(runId)
    || databasePath !== `/tmp/bitveins-e2e-${runId}.sqlite`
    || pidPath !== `/tmp/bitveins-e2e-${runId}.pid`
    || socketName !== `bitveins-e2e-${runId}`
    || workspace !== `/tmp/bitveins-e2e-workspace-${runId}`
  ) {
    throw new Error('Refusing to clean a non-isolated E2E environment.')
  }

  const pid = Number(await readFile(pidPath, 'utf8'))
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('The isolated E2E server PID is invalid.')
  }

  if (isRunning(pid)) {
    if (!await isIsolatedServer(pid)) {
      throw new Error(`Refusing to signal non-E2E process ${pid}.`)
    }
    process.kill(pid, 'SIGTERM')
    await waitForExit(pid)
  }

  await execFileAsync('tmux', ['-L', socketName, 'kill-server']).catch(() => undefined)
  const socketPath = join(
    process.env.TMUX_TMPDIR || tmpdir(),
    `tmux-${process.getuid()}`,
    socketName,
  )
  await Promise.all([
    rm(workspace, { force: true, recursive: true }),
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true }),
    rm(pidPath, { force: true }),
    rm(socketPath, { force: true }),
  ])
}
