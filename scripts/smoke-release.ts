import { randomUUID } from 'node:crypto'
import {
  spawn,
  type ChildProcess,
} from 'node:child_process'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import {
  join,
  resolve,
} from 'node:path'
import { ReleaseArchive } from '../cli/platform/release-archive.ts'
import { generateAttentionSecrets } from '../shared/security/attention-secrets.ts'
import {
  parsePackageVersion,
  releaseArtifactPaths,
} from './release/release-artifact.ts'

const root = resolve(new URL('..', import.meta.url).pathname)
const packageVersion = parsePackageVersion(
  JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as unknown,
)
const version = process.env.BITVEINS_VERSION || packageVersion
const artifact = releaseArtifactPaths(root, version)
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'bitveins-artifact-smoke-'))
const releaseArchive = new ReleaseArchive()
const runId = `artifact-${randomUUID().replaceAll('-', '')}`
const socketName = `bitveins-e2e-${runId}`
const databasePath = `/tmp/bitveins-e2e-${runId}.sqlite`
const pidPath = `/tmp/bitveins-e2e-${runId}.pid`
const workspace = `/tmp/bitveins-e2e-workspace-${runId}`

async function availablePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate an artifact smoke port.'))
        return
      }
      server.close(error => error ? reject(error) : resolvePort(address.port))
    })
  })
}

function run(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: environment,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', code => code === 0
      ? resolveRun()
      : reject(new Error(`${command} exited with code ${code}.`)))
  })
}

const port = await availablePort()
let server: ChildProcess | undefined

try {
  const releaseRoot = await releaseArchive.extract(
    artifact.archivePath,
    temporaryDirectory,
    artifact.archiveRootName,
  )
  const node = join(releaseRoot, 'runtime', 'bin', 'node')
  const cli = join(releaseRoot, 'bin', 'bitveins')
  const serverEntry = join(releaseRoot, 'app', '.output', 'server', 'index.mjs')
  const serviceWorker = await readFile(join(releaseRoot, 'app', '.output', 'public', 'sw.js'), 'utf8')
  if (
    !serviceWorker.includes('"push"')
    || !serviceWorker.includes('"notificationclick"')
    || !serviceWorker.includes('showNotification')
  ) {
    throw new Error('Packaged Service Worker is missing Web Push handlers.')
  }
  const home = join(temporaryDirectory, 'home')
  const configHome = join(home, '.config')
  const configDirectory = join(configHome, 'bitveins')
  const secrets = generateAttentionSecrets()
  const sessionPassword = 'artifact-smoke-session-secret-with-at-least-32-characters'
  const authPasswordHash = '$scrypt$n=16384,r=8,p=1$gBJh+RfZmL0WCKMY8mD12Q$/MGcwEHKloyZMmolFZgFrHtKatncAWMy0nWlhKGSdVVKRScci2V94VnBpJtmh4Tio3TDjdCqHUq8Ga6V0FtjKA'
  await mkdir(configDirectory, { mode: 0o700, recursive: true })
  const environmentFile = [
    ['HOST', '127.0.0.1'],
    ['PORT', String(port)],
    ['BITVEINS_ALLOWED_ORIGINS', `http://127.0.0.1:${port}`],
    ['BITVEINS_AUTH_PASSWORD_HASH', authPasswordHash],
    ['BITVEINS_AUTH_VERSION', '1'],
    ['BITVEINS_DATABASE_PATH', databasePath],
    ['BITVEINS_EVENT_TOKEN', secrets.eventToken],
    ['BITVEINS_VAPID_PRIVATE_KEY', secrets.vapidPrivateKey],
    ['BITVEINS_VAPID_PUBLIC_KEY', secrets.vapidPublicKey],
    ['NUXT_SESSION_PASSWORD', sessionPassword],
  ].map(([key, value]) => `${key}="${value}"`).join('\n')
  await writeFile(join(configDirectory, 'env'), `${environmentFile}\n`, { mode: 0o600 })
  const environment = {
    ...process.env,
    HOME: home,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
      ?? join(process.env.HOME ?? process.cwd(), '.cache', 'ms-playwright'),
    XDG_CONFIG_HOME: configHome,
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    NUXT_SESSION_COOKIE_SECURE: 'false',
    NUXT_SESSION_PASSWORD: sessionPassword,
    PORT: String(port),
    BITVEINS_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
    BITVEINS_AUTH_PASSWORD_HASH: authPasswordHash,
    BITVEINS_EVENT_TOKEN: secrets.eventToken,
    BITVEINS_VAPID_PRIVATE_KEY: secrets.vapidPrivateKey,
    BITVEINS_VAPID_PUBLIC_KEY: secrets.vapidPublicKey,
    BITVEINS_DATABASE_PATH: databasePath,
    BITVEINS_E2E_DATABASE_PATH: databasePath,
    BITVEINS_E2E_EXTERNAL_SERVER: '1',
    BITVEINS_E2E_PORT: String(port),
    BITVEINS_E2E_RUN_ID: runId,
    BITVEINS_E2E_SERVER_ENTRY: serverEntry,
    BITVEINS_E2E_SERVER_PID_PATH: pidPath,
    BITVEINS_E2E_TMUX_SOCKET_NAME: socketName,
    BITVEINS_E2E_WORKSPACE: workspace,
    BITVEINS_TMUX_SOCKET_NAME: socketName,
  }

  server = spawn(node, [join(root, 'scripts', 'run-isolated-e2e-server.ts')], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  })

  let healthy = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Packaged Bitveins server exited with code ${server.exitCode}.`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`)
      if (response.status === 200) {
        healthy = true
        break
      }
    }
    catch {
      // The packaged server is still starting.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
  }

  if (!healthy) {
    throw new Error('Packaged Bitveins server did not become healthy.')
  }

  await run(cli, [
    'event',
    'information',
    '--source',
    'release-smoke',
    '--title',
    'Packaged Agent Inbox event',
  ], environment)

  await run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'tests/e2e/agent-inbox.spec.ts',
      'tests/e2e/authenticated-terminal.spec.ts',
      'tests/e2e/explorer-media-previews.spec.ts',
      'tests/e2e/mobile-live-keyboard.spec.ts',
    ],
    environment,
  )
  // eslint-disable-next-line no-console
  console.log(`Artifact smoke passed for ${artifact.archiveName}`)
}
finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
  }
  await rm(temporaryDirectory, { force: true, recursive: true })
}
