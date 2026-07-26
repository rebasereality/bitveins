import {
  chmod,
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import type { InstallationLayout } from '../../../cli/core/installation-layout'
import {
  serializeEnvironmentFile,
  type BitveinsEnvironment,
} from '../../../cli/core/environment-file'

export async function createReleaseFixture(
  layout: InstallationLayout,
  options: {
    commit?: string
    version?: string
  } = {},
): Promise<string> {
  const version = options.version ?? '0.1.0'
  const root = join(layout.releasesDirectory, version)

  await Promise.all([
    mkdir(join(root, 'app', '.output', 'server'), { recursive: true }),
    mkdir(join(root, 'bin'), { recursive: true }),
    mkdir(join(root, 'runtime', 'bin'), { recursive: true }),
    mkdir(join(root, 'share', 'bitveins'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(root, 'app', '.output', 'server', 'index.mjs'), ''),
    writeFile(join(root, 'bin', 'bitveins'), ''),
    writeFile(join(root, 'runtime', 'bin', 'node'), ''),
    writeFile(
      join(root, 'share', 'bitveins', 'release.json'),
      JSON.stringify({
        architecture: 'x64',
        commit: options.commit ?? 'a'.repeat(40),
        nodeVersion: process.version,
        platform: 'linux',
        version,
      }),
    ),
  ])
  await Promise.all([
    chmod(join(root, 'bin', 'bitveins'), 0o755),
    chmod(join(root, 'runtime', 'bin', 'node'), 0o755),
  ])

  return root
}

export async function writeEnvironmentFixture(
  layout: InstallationLayout,
  overrides: Partial<BitveinsEnvironment> = {},
): Promise<void> {
  const environment = createEnvironmentFixture(overrides)
  await mkdir(layout.configDirectory, { recursive: true })
  await writeFile(
    layout.environmentFile,
    serializeEnvironmentFile(environment),
    { mode: 0o600 },
  )
}

export function createEnvironmentFixture(
  overrides: Partial<BitveinsEnvironment> = {},
): BitveinsEnvironment {
  return {
    allowedOrigins: ['http://127.0.0.1:4567', 'http://localhost:4567'],
    authPasswordHash: '$fixture-hash',
    authVersion: '1',
    databasePath: '/tmp/bitveins-fixture.sqlite',
    extensions: {},
    host: '127.0.0.1',
    port: 4567,
    sessionPassword: 'fixture-session-secret-with-at-least-32-characters',
    ...overrides,
  }
}
