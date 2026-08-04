import {
  lstat,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createCliApplication,
  runBitveinsCli,
} from '../../cli/composition-root'
import { CliExitCode } from '../../cli/core/cli-error'

const temporaryDirectories: string[] = []

vi.mock('../../cli/platform/node-command-runner', () => ({
  NodeCommandRunner: class {
    async run() {
      return { exitCode: 0, stderr: '', stdout: '' }
    }

    async which() {
      return '/usr/bin/hermes'
    }
  },
}))

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(
    async directory => await rm(directory, { force: true, recursive: true }),
  ))
})

describe('CLI composition root', () => {
  it('wires the complete command registry around the packaged release', async () => {
    vi.stubEnv('BITVEINS_RELEASE_ROOT', '/opt/bitveins/release')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(
      () => true,
    )

    await expect(createCliApplication('1.2.3').run(['help'])).resolves.toBe(
      CliExitCode.Success,
    )

    expect(stdout).toHaveBeenCalled()
    expect(String(stdout.mock.calls[0]?.[0])).toContain('bitveins install')
  })

  it('uses the default bundle location and forwards arguments', async () => {
    vi.stubEnv('BITVEINS_RELEASE_ROOT', '')
    vi.stubEnv('HERMES_HOME', '   ')
    vi.stubEnv('HOME', '')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(
      () => true,
    )

    await expect(runBitveinsCli(['version'], '1.2.3')).resolves.toBe(
      CliExitCode.Success,
    )
    expect(stdout).toHaveBeenCalledWith('1.2.3\n')
  })

  it('passes a trimmed custom HERMES_HOME through the packaged Hermes installer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-composition-hermes-'))
    temporaryDirectories.push(root)
    const home = join(root, 'home')
    const releaseRoot = join(root, 'release')
    const pluginSource = join(releaseRoot, 'share', 'bitveins', 'hermes-plugin')
    const hermesHome = join(root, 'custom-hermes')
    await mkdir(home, { recursive: true })
    await mkdir(pluginSource, { recursive: true })
    for (const file of ['__init__.py', 'plugin.yaml', 'README.md', 'test_plugin.py']) {
      await writeFile(join(pluginSource, file), `fixture:${file}\n`, { mode: 0o644 })
    }
    vi.stubEnv('HOME', home)
    vi.stubEnv('HERMES_HOME', `  ${hermesHome}  `)
    vi.stubEnv('BITVEINS_RELEASE_ROOT', releaseRoot)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await expect(createCliApplication('1.2.3').run(['hermes', 'install']))
      .resolves.toBe(CliExitCode.Success)

    const target = join(hermesHome, 'plugins', 'bitveins-notifications')
    expect((await lstat(target)).mode & 0o777).toBe(0o700)
    expect((await lstat(join(target, 'plugin.yaml'))).mode & 0o777).toBe(0o600)
  })
})
