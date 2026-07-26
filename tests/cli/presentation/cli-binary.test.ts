import { spawnSync } from 'node:child_process'
import {
  mkdtemp,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'

const root = resolve(new URL('../../..', import.meta.url).pathname)
const binary = join(root, '.bitveins-build', 'cli', 'index.mjs')
let home: string

function run(args: readonly string[]) {
  return spawnSync(process.execPath, [binary, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      BITVEINS_INSTALL_ROOT: join(home, '.local', 'lib', 'bitveins'),
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_DATA_HOME: join(home, '.local', 'share'),
      XDG_STATE_HOME: join(home, '.local', 'state'),
    },
  })
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'bitveins-cli-characterization-'))
  const build = spawnSync(process.execPath, ['scripts/build-cli.ts'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (build.status !== 0) {
    throw new Error(`CLI build failed:\n${build.stderr || build.stdout}`)
  }
})

afterAll(async () => {
  await rm(home, { force: true, recursive: true })
})

describe('packaged CLI argument surface', () => {
  it('prints help only to stdout', () => {
    const result = run(['help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage:')
    expect(result.stdout).toContain('bitveins update [--version <version>]')
    expect(result.stderr).toBe('')
  })

  it('prints the embedded version only to stdout', () => {
    const result = run(['version'])

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/)
    expect(result.stderr).toBe('')
  })

  it('prints targeted subcommand help without invoking the command', () => {
    const result = run(['update', '--help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Download, verify and activate')
    expect(result.stdout).toContain('--version <version>')
    expect(result.stderr).toBe('')
  })

  it.each([
    {
      args: ['unknown'],
      message: 'Unknown Bitveins command: unknown',
    },
    {
      args: ['install', '--port'],
      message: '--port requires a value.',
    },
    {
      args: ['install', '--unexpected'],
      message: 'Unexpected argument: --unexpected',
    },
    {
      args: ['install', '--port', '3456', '--port', '4567'],
      message: '--port may only be provided once.',
    },
  ])('rejects invalid input $args without stdout noise', ({ args, message }) => {
    const result = run(args)

    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(`error: ${message}`)
  })
})
