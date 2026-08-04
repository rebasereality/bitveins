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
import { FilesystemHermesPluginInstaller } from '../../../cli/platform/filesystem-hermes-plugin-installer'
import type { CommandRunner } from '../../../cli/ports/command-runner'

const temporaryDirectories: string[] = []
const pluginFiles = ['__init__.py', 'plugin.yaml', 'README.md', 'test_plugin.py'] as const

async function fixture(): Promise<{ home: string, source: string }> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-hermes-plugin-'))
  temporaryDirectories.push(root)
  const home = join(root, 'home')
  const source = join(root, 'source')
  await mkdir(home, { recursive: true })
  await mkdir(source, { recursive: true })
  await Promise.all(pluginFiles.map(async name => await writeFile(
    join(source, name),
    `fixture:${name}\n`,
    { mode: 0o644 },
  )))
  return { home, source }
}

function commands(hermes: string | null = '/usr/bin/hermes'): CommandRunner {
  return {
    run: vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' }),
    which: vi.fn().mockResolvedValue(hermes),
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(
    async directory => await rm(directory, { force: true, recursive: true }),
  ))
})

describe('FilesystemHermesPluginInstaller', () => {
  it('atomically installs private plugin files and enables the plugin', async () => {
    const { home, source } = await fixture()
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    const target = await installer.install()

    expect(target).toBe(join(home, '.hermes', 'plugins', 'bitveins-notifications'))
    expect((await lstat(target)).mode & 0o777).toBe(0o700)
    for (const name of pluginFiles) {
      expect(await readFile(join(target, name), 'utf8')).toBe(`fixture:${name}\n`)
      expect((await lstat(join(target, name))).mode & 0o777).toBe(0o600)
    }
    expect(runner.which).toHaveBeenCalledWith('hermes')
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/hermes',
      ['--profile', 'default', 'plugins', 'enable', 'bitveins-notifications'],
      { environment: { HERMES_HOME: join(home, '.hermes') } },
    )
  })

  it('installs into an existing named profile without path traversal', async () => {
    const { home, source } = await fixture()
    await mkdir(join(home, '.hermes', 'profiles', 'ops'), { recursive: true })
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    const target = await installer.install('ops')

    expect(target).toBe(join(
      home,
      '.hermes',
      'profiles',
      'ops',
      'plugins',
      'bitveins-notifications',
    ))
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/hermes',
      ['--profile', 'ops', 'plugins', 'enable', 'bitveins-notifications'],
      { environment: { HERMES_HOME: join(home, '.hermes') } },
    )
    await expect(installer.install('../escape')).rejects.toThrow(/profile name/)
    await expect(installer.install('Ops')).rejects.toThrow(/profile name/)
  })

  it('fails before writing when Hermes is unavailable', async () => {
    const { home, source } = await fixture()
    const installer = new FilesystemHermesPluginInstaller({
      commands: commands(null),
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow(/Hermes Agent CLI/)
    await expect(lstat(join(home, '.hermes'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a concurrent install instead of interleaving plugin versions', async () => {
    const { home, source } = await fixture()
    const runner = commands()
    let releaseFirst!: () => void
    let markEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve
    })
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    vi.mocked(runner.run).mockImplementationOnce(async () => {
      markEntered()
      await release
      return { exitCode: 0, stderr: '', stdout: '' }
    })
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    const first = installer.install()
    await entered
    await expect(installer.install()).rejects.toThrow(
      'Another Bitveins installation operation is already running.',
    )
    releaseFirst()
    await expect(first).resolves.toContain('bitveins-notifications')
  })

  it('serializes installers by canonical HERMES_HOME rather than HOME', async () => {
    const { home, source } = await fixture()
    const otherHome = join(dirname(home), 'other-home')
    const hermesHome = join(dirname(home), 'shared-hermes')
    await Promise.all([
      mkdir(otherHome, { mode: 0o700 }),
      mkdir(hermesHome, { mode: 0o700 }),
    ])
    const firstRunner = commands()
    let releaseFirst!: () => void
    let markEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve
    })
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    vi.mocked(firstRunner.run).mockImplementationOnce(async () => {
      markEntered()
      await release
      return { exitCode: 0, stderr: '', stdout: '' }
    })
    const firstInstaller = new FilesystemHermesPluginInstaller({
      commands: firstRunner,
      hermesHome,
      home,
      sourceDirectory: source,
    })
    const secondInstaller = new FilesystemHermesPluginInstaller({
      commands: commands(),
      hermesHome,
      home: otherHome,
      sourceDirectory: source,
    })

    const first = firstInstaller.install()
    await entered
    await expect(secondInstaller.install()).rejects.toThrow(
      'Another Bitveins installation operation is already running.',
    )
    releaseFirst()
    await expect(first).resolves.toContain('bitveins-notifications')
  })

  it('refuses a symbolic plugin destination', async () => {
    const { home, source } = await fixture()
    const plugins = join(home, '.hermes', 'plugins')
    const external = join(home, 'external')
    await mkdir(plugins, { recursive: true })
    await mkdir(external)
    await symlink(external, join(plugins, 'bitveins-notifications'))
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow(/symbolic link/)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('uses one explicit custom HERMES_HOME for copying and activation', async () => {
    const { home, source } = await fixture()
    const hermesHome = join(dirname(home), 'custom-hermes')
    await mkdir(hermesHome, { mode: 0o700 })
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      hermesHome,
      home,
      sourceDirectory: source,
    })

    const result = await installer.install()

    expect(result).toBe(join(hermesHome, 'plugins', 'bitveins-notifications'))
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/hermes',
      ['--profile', 'default', 'plugins', 'enable', 'bitveins-notifications'],
      { environment: { HERMES_HOME: hermesHome } },
    )
    await expect(lstat(join(home, '.hermes'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('repairs private permissions on every existing directory it consumes', async () => {
    const { home, source } = await fixture()
    const hermesHome = join(home, '.hermes')
    const profileDirectory = join(hermesHome, 'profiles', 'ops')
    const pluginsDirectory = join(profileDirectory, 'plugins')
    await mkdir(pluginsDirectory, { recursive: true, mode: 0o777 })
    for (const directory of [hermesHome, join(hermesHome, 'profiles'), profileDirectory, pluginsDirectory]) {
      await chmod(directory, 0o777)
    }
    const installer = new FilesystemHermesPluginInstaller({
      commands: commands(),
      home,
      sourceDirectory: source,
    })

    await installer.install('ops')

    for (const directory of [hermesHome, join(hermesHome, 'profiles'), profileDirectory, pluginsDirectory]) {
      expect((await lstat(directory)).mode & 0o777).toBe(0o700)
    }
  })

  it('replaces the complete plugin directory instead of leaving obsolete files', async () => {
    const { home, source } = await fixture()
    const target = join(home, '.hermes', 'plugins', 'bitveins-notifications')
    await mkdir(target, { recursive: true, mode: 0o700 })
    await writeFile(join(target, 'obsolete.py'), 'old\n', { mode: 0o600 })
    const installer = new FilesystemHermesPluginInstaller({
      commands: commands(),
      home,
      sourceDirectory: source,
    })

    await installer.install()

    expect((await readdir(target)).sort()).toEqual([...pluginFiles].sort())
  })

  it('restores the previous plugin if Hermes activation fails', async () => {
    const { home, source } = await fixture()
    const pluginsDirectory = join(home, '.hermes', 'plugins')
    const target = join(pluginsDirectory, 'bitveins-notifications')
    await mkdir(target, { recursive: true, mode: 0o700 })
    await writeFile(join(target, 'previous.txt'), 'previous version\n', { mode: 0o600 })
    const runner = commands()
    vi.mocked(runner.run).mockRejectedValueOnce(new Error('activation failed'))
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow('activation failed')

    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous version\n')
    expect(await readdir(target)).toEqual(['previous.txt'])
    expect((await readdir(pluginsDirectory)).filter(name => name.startsWith('.bitveins-notifications.'))).toEqual([])
  })

  it('leaves the previous plugin untouched when staging cannot copy the source', async () => {
    const { home, source } = await fixture()
    const target = join(home, '.hermes', 'plugins', 'bitveins-notifications')
    await mkdir(target, { recursive: true, mode: 0o700 })
    await writeFile(join(target, 'previous.txt'), 'previous version\n', { mode: 0o600 })
    await chmod(join(source, 'README.md'), 0o000)
    const installer = new FilesystemHermesPluginInstaller({
      commands: commands(),
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow()

    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous version\n')
    expect(await readdir(target)).toEqual(['previous.txt'])
  })

  it('refuses a symbolic release plugin source directory', async () => {
    const { home, source } = await fixture()
    const sourceLink = join(dirname(source), 'plugin-source-link')
    await symlink(source, sourceLink)
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: sourceLink,
    })

    await expect(installer.install()).rejects.toThrow(/source directory|symbolic/i)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('requires an explicitly selected named profile to exist', async () => {
    const { home, source } = await fixture()
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install('missing')).rejects.toThrow(/profile does not exist/)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('refuses a regular file as an existing plugin destination', async () => {
    const { home, source } = await fixture()
    const plugins = join(home, '.hermes', 'plugins')
    await mkdir(plugins, { recursive: true })
    await writeFile(join(plugins, 'bitveins-notifications'), 'not a directory\n')
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow(/expected a directory/i)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('refuses a group-writable release plugin source directory', async () => {
    const { home, source } = await fixture()
    await chmod(source, 0o770)
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow(/source directory.*writable/i)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('refuses a regular file as the release plugin source directory', async () => {
    const { home, source } = await fixture()
    const sourceFile = join(dirname(source), 'source-file')
    await writeFile(sourceFile, 'not a directory\n', { mode: 0o644 })
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: sourceFile,
    })

    await expect(installer.install()).rejects.toThrow(/source directory.*regular directory/i)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('refuses writable, symbolic, non-file, oversized and missing release plugin files', async () => {
    for (const defect of ['writable', 'symbolic', 'directory', 'oversized', 'missing'] as const) {
      const { home, source } = await fixture()
      const readme = join(source, 'README.md')
      if (defect === 'writable') {
        await chmod(readme, 0o666)
      }
      else if (defect === 'symbolic') {
        await rm(readme)
        await symlink('__init__.py', readme)
      }
      else if (defect === 'directory') {
        await rm(readme)
        await mkdir(readme)
      }
      else if (defect === 'oversized') {
        await writeFile(readme, Buffer.alloc(1_048_577))
      }
      else {
        await rm(readme)
      }
      const runner = commands()
      const installer = new FilesystemHermesPluginInstaller({
        commands: runner,
        home,
        sourceDirectory: source,
      })

      await expect(installer.install()).rejects.toThrow()
      expect(runner.run).not.toHaveBeenCalled()
    }
  })

  it('refuses Hermes paths not owned by the current user', async () => {
    const { home, source } = await fixture()
    const getuid = process.getuid
    if (!getuid) throw new Error('This test requires a POSIX getuid implementation.')
    const currentUid = getuid()
    vi.spyOn(process, 'getuid').mockReturnValue(currentUid + 1)
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install()).rejects.toThrow(/not owned by the current user/i)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('supports runtimes without a POSIX getuid implementation', async () => {
    const { home, source } = await fixture()
    const getuid = process.getuid
    Object.defineProperty(process, 'getuid', { configurable: true, value: undefined })
    const installer = new FilesystemHermesPluginInstaller({
      commands: commands(),
      home,
      sourceDirectory: source,
    })

    try {
      await expect(installer.install()).resolves.toContain('bitveins-notifications')
    }
    finally {
      Object.defineProperty(process, 'getuid', { configurable: true, value: getuid })
    }
  })

  it('removes a fresh installation when Hermes activation fails', async () => {
    const { home, source } = await fixture()
    const runner = commands()
    vi.mocked(runner.run).mockRejectedValueOnce(new Error('activation failed'))
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      home,
      sourceDirectory: source,
    })
    const target = join(home, '.hermes', 'plugins', 'bitveins-notifications')

    await expect(installer.install()).rejects.toThrow('activation failed')
    await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(dirname(target))).filter(name => name.startsWith('.bitveins-notifications.'))).toEqual([])
  })

  it('normalizes a profile-scoped Hermes path to the shared Hermes root', async () => {
    const { home, source } = await fixture()
    const hermesRoot = join(dirname(home), 'custom-hermes')
    const profileHome = join(hermesRoot, 'profiles', 'work')
    await mkdir(profileHome, { recursive: true, mode: 0o700 })
    const runner = commands()
    const installer = new FilesystemHermesPluginInstaller({
      commands: runner,
      hermesHome: profileHome,
      home,
      sourceDirectory: source,
    })

    await expect(installer.install('work')).resolves.toBe(join(
      profileHome,
      'plugins',
      'bitveins-notifications',
    ))
    expect(runner.run).toHaveBeenCalledWith(
      '/usr/bin/hermes',
      ['--profile', 'work', 'plugins', 'enable', 'bitveins-notifications'],
      { environment: { HERMES_HOME: hermesRoot } },
    )
  })
})
