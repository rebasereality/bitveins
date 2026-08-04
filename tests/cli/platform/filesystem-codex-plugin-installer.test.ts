import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { FilesystemCodexPluginInstaller } from '../../../cli/platform/filesystem-codex-plugin-installer'
import type { CommandRunner } from '../../../cli/ports/command-runner'

const temporaryDirectories: string[] = []
const pluginFiles = [
  '.agents/plugins/marketplace.json',
  'plugins/bitveins-notifications/.codex-plugin/plugin.json',
  'plugins/bitveins-notifications/README.md',
  'plugins/bitveins-notifications/hooks/hooks.json',
  'plugins/bitveins-notifications/hooks/bitveins_notifications.py',
] as const

async function fixture(): Promise<{ root: string, source: string, target: string }> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-codex-plugin-'))
  temporaryDirectories.push(root)
  const source = join(root, 'source')
  const target = join(root, 'data', 'codex-marketplace')
  await mkdir(source, { recursive: true })
  for (const relativePath of pluginFiles) {
    const path = join(source, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `fixture:${relativePath}\n`, { mode: 0o644 })
  }
  return { root, source, target }
}

function commands(options: {
  codex?: string | null
  root?: string | null
} = {}): CommandRunner {
  const configuredRoot = options.root === undefined ? null : options.root
  return {
    run: vi.fn().mockImplementation(async (_command, args: readonly string[] = []) => {
      if (args.join(' ') === 'plugin marketplace list --json') {
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            marketplaces: configuredRoot
              ? [{ name: 'bitveins', root: configuredRoot }]
              : [{ name: 'openai-curated', root: '/tmp/openai' }],
          }),
        }
      }
      return { exitCode: 0, stderr: '', stdout: '' }
    }),
    which: vi.fn().mockResolvedValue(options.codex === undefined ? '/usr/bin/codex' : options.codex),
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(
    async directory => await rm(directory, { force: true, recursive: true }),
  ))
})

describe('FilesystemCodexPluginInstaller', () => {
  it('atomically installs a private marketplace and activates the plugin', async () => {
    const { source, target } = await fixture()
    const runner = commands()
    const installer = new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    })

    const installed = await installer.install()

    expect(installed).toBe(join(target, 'plugins', 'bitveins-notifications'))
    expect((await lstat(target)).mode & 0o777).toBe(0o700)
    for (const relativePath of pluginFiles) {
      expect(await readFile(join(target, relativePath), 'utf8')).toBe(
        `fixture:${relativePath}\n`,
      )
      expect((await lstat(join(target, relativePath))).mode & 0o777).toBe(0o600)
    }
    expect(runner.which).toHaveBeenCalledWith('codex')
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/codex',
      ['plugin', 'marketplace', 'add', target],
    )
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/codex',
      ['plugin', 'add', 'bitveins-notifications@bitveins'],
    )
  })

  it('updates an existing matching marketplace without adding it again', async () => {
    const { source, target } = await fixture()
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'obsolete.txt'), 'obsolete\n')
    const runner = commands({ root: target })
    const installer = new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    })

    await installer.install()

    expect(await readdir(target)).toEqual(expect.arrayContaining(['.agents', 'plugins']))
    await expect(lstat(join(target, 'obsolete.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(vi.mocked(runner.run).mock.calls.some(([, args]) => (
      (args as string[]).slice(0, 3).join(' ') === 'plugin marketplace add'
    ))).toBe(false)
  })

  it('refuses a marketplace name that points somewhere else', async () => {
    const { source, target } = await fixture()
    const runner = commands({ root: '/other/marketplace' })
    const installer = new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    })

    await expect(installer.install()).rejects.toThrow(/already points/)
    await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('fails before writing when Codex is unavailable', async () => {
    const { source, target } = await fixture()
    const installer = new FilesystemCodexPluginInstaller({
      commands: commands({ codex: null }),
      sourceDirectory: source,
      targetDirectory: target,
    })

    await expect(installer.install()).rejects.toThrow(/Codex CLI/)
    await expect(lstat(dirname(target))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rolls back files and the marketplace when fresh activation fails', async () => {
    const { source, target } = await fixture()
    const runner = commands()
    vi.mocked(runner.run).mockImplementation(async (_command, args: readonly string[] = []) => {
      const joined = args.join(' ')
      if (joined === 'plugin marketplace list --json') {
        return { exitCode: 0, stderr: '', stdout: '{"marketplaces":[]}' }
      }
      if (joined === 'plugin add bitveins-notifications@bitveins') {
        throw new Error('activation failed')
      }
      return { exitCode: 0, stderr: '', stdout: '' }
    })
    const installer = new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    })

    await expect(installer.install()).rejects.toThrow('activation failed')

    await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/codex',
      ['plugin', 'marketplace', 'remove', 'bitveins'],
      { allowFailure: true },
    )
  })

  it('restores the previous marketplace when an update activation fails', async () => {
    const { source, target } = await fixture()
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'previous.txt'), 'previous\n')
    const runner = commands({ root: target })
    vi.mocked(runner.run).mockImplementation(async (_command, args: readonly string[] = []) => {
      if (args.join(' ') === 'plugin marketplace list --json') {
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ marketplaces: [{ name: 'bitveins', root: target }] }),
        }
      }
      throw new Error('activation failed')
    })
    const installer = new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    })

    await expect(installer.install()).rejects.toThrow('activation failed')
    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous\n')
  })

  it('rejects malformed marketplace JSON before touching the target', async () => {
    const { source, target } = await fixture()
    const runner = commands()
    vi.mocked(runner.run).mockResolvedValueOnce({
      exitCode: 0,
      stderr: '',
      stdout: 'not-json',
    })
    const installer = new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    })

    await expect(installer.install()).rejects.toThrow(/invalid marketplace list/)
    await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects duplicate or malformed Bitveins marketplace entries', async () => {
    for (const marketplaces of [
      [{ name: 'bitveins', root: 42 }],
      [
        { name: 'bitveins', root: '/first' },
        { name: 'bitveins', root: '/second' },
      ],
    ]) {
      const { source, target } = await fixture()
      const runner = commands()
      vi.mocked(runner.run).mockResolvedValueOnce({
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({ marketplaces }),
      })

      await expect(new FilesystemCodexPluginInstaller({
        commands: runner,
        sourceDirectory: source,
        targetDirectory: target,
      }).install()).rejects.toThrow(/invalid Bitveins marketplace entry/)
    }
  })

  it('supports runtimes without a POSIX getuid implementation', async () => {
    const { source, target } = await fixture()
    const getuid = process.getuid
    Object.defineProperty(process, 'getuid', { configurable: true, value: undefined })

    try {
      await expect(new FilesystemCodexPluginInstaller({
        commands: commands(),
        sourceDirectory: source,
        targetDirectory: target,
      }).install()).resolves.toContain('bitveins-notifications')
    }
    finally {
      Object.defineProperty(process, 'getuid', { configurable: true, value: getuid })
    }
  })

  it('refuses writable, symbolic, oversized, and missing source files', async () => {
    for (const defect of ['writable', 'symbolic', 'oversized', 'missing'] as const) {
      const { source, target } = await fixture()
      const readme = join(source, 'plugins/bitveins-notifications/README.md')
      if (defect === 'writable') await chmod(readme, 0o666)
      else if (defect === 'symbolic') {
        await rm(readme)
        await symlink('hooks/hooks.json', readme)
      }
      else if (defect === 'oversized') await writeFile(readme, Buffer.alloc(1_048_577))
      else await rm(readme)
      const runner = commands()
      const installer = new FilesystemCodexPluginInstaller({
        commands: runner,
        sourceDirectory: source,
        targetDirectory: target,
      })

      await expect(installer.install()).rejects.toThrow()
      expect(vi.mocked(runner.run).mock.calls.some(([, args]) => (
        (args as string[])[1] === 'add'
      ))).toBe(false)
    }
  })

  it('refuses symbolic or writable source directories', async () => {
    const { root, source, target } = await fixture()
    const sourceLink = join(root, 'source-link')
    await symlink(source, sourceLink)
    await expect(new FilesystemCodexPluginInstaller({
      commands: commands(),
      sourceDirectory: sourceLink,
      targetDirectory: target,
    }).install()).rejects.toThrow(/source.*directory/i)

    await chmod(source, 0o770)
    await expect(new FilesystemCodexPluginInstaller({
      commands: commands(),
      sourceDirectory: source,
      targetDirectory: target,
    }).install()).rejects.toThrow(/writable/i)
  })

  it('refuses symbolic nested source and destination directories', async () => {
    const { root, source, target } = await fixture()
    const hooks = join(source, 'plugins/bitveins-notifications/hooks')
    const realHooks = join(root, 'real-hooks')
    await mkdir(realHooks)
    await rm(hooks, { recursive: true })
    await symlink(realHooks, hooks)
    const runner = commands()
    await expect(new FilesystemCodexPluginInstaller({
      commands: runner,
      sourceDirectory: source,
      targetDirectory: target,
    }).install()).rejects.toThrow(/source.*directory/i)

    await rm(hooks)
    await mkdir(hooks)
    await Promise.all([
      writeFile(join(hooks, 'hooks.json'), '{}\n'),
      writeFile(join(hooks, 'bitveins_notifications.py'), '# fixture\n'),
    ])
    await mkdir(dirname(target), { recursive: true })
    await symlink(realHooks, target)
    await expect(new FilesystemCodexPluginInstaller({
      commands: commands({ root: target }),
      sourceDirectory: source,
      targetDirectory: target,
    }).install()).rejects.toThrow(/regular Codex plugin directory/i)
  })
})
