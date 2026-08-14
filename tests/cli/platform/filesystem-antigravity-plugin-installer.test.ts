import {
  mkdir,
  mkdtemp,
  readFile,
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
import { FilesystemAntigravityPluginInstaller } from '../../../cli/platform/filesystem-antigravity-plugin-installer'

const temporaryDirectories: string[] = []

async function fixture(): Promise<{ home: string, source: string }> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-antigravity-plugin-'))
  temporaryDirectories.push(root)
  const home = join(root, 'home')
  const source = join(root, 'source')
  await mkdir(home, { recursive: true })
  await mkdir(source, { recursive: true })
  await writeFile(
    join(source, 'bitveins_antigravity_notifications.py'),
    '# test script\n',
    { mode: 0o644 },
  )
  return { home, source }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(
    async directory => await rm(directory, { force: true, recursive: true }),
  ))
})

describe('FilesystemAntigravityPluginInstaller', () => {
  it('installs the notification script and registers hooks in hooks.json', async () => {
    const { home, source } = await fixture()
    const installer = new FilesystemAntigravityPluginInstaller({
      home,
      sourceDirectory: source,
    })

    const { hooksPath, scriptPath } = await installer.install()

    expect(hooksPath).toBe(join(home, '.gemini', 'config', 'hooks.json'))
    expect(scriptPath).toBe(
      join(home, '.config', 'bitveins', 'antigravity', 'bitveins_antigravity_notifications.py'),
    )

    const scriptContent = await readFile(scriptPath, 'utf8')
    expect(scriptContent).toBe('# test script\n')

    const hooksJson = JSON.parse(await readFile(hooksPath, 'utf8')) as Record<string, unknown>
    expect(hooksJson['bitveins-notifications']).toBeDefined()
  })

  it('preserves existing hooks in hooks.json while adding bitveins-notifications', async () => {
    const { home, source } = await fixture()
    const geminiConfig = join(home, '.gemini', 'config')
    await mkdir(geminiConfig, { recursive: true })
    await writeFile(
      join(geminiConfig, 'hooks.json'),
      JSON.stringify({ 'other-tool': { PreInvocation: [] } }),
      { mode: 0o600 },
    )

    const installer = new FilesystemAntigravityPluginInstaller({
      home,
      sourceDirectory: source,
    })

    const { hooksPath } = await installer.install()

    const hooksJson = JSON.parse(await readFile(hooksPath, 'utf8')) as Record<string, unknown>
    expect(hooksJson['other-tool']).toBeDefined()
    expect(hooksJson['bitveins-notifications']).toBeDefined()
  })
})
