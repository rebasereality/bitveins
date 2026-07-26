import {
  chmod,
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
} from 'vitest'
import { CliExitCode } from '../../../cli/core/cli-error'
import {
  CommandExecutionError,
  NodeCommandRunner,
} from '../../../cli/platform/node-command-runner'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('NodeCommandRunner', () => {
  it('captures stdout, stderr and the process exit code', async () => {
    const runner = new NodeCommandRunner()

    const result = await runner.run(process.execPath, [
      '--input-type=module',
      '--eval',
      'process.stdout.write("out"); process.stderr.write("err")',
    ])

    expect(result).toEqual({ exitCode: 0, stderr: 'err', stdout: 'out' })
  })

  it('preserves actionable diagnostics for a failed command', async () => {
    const runner = new NodeCommandRunner()

    const result = runner.run(process.execPath, [
      '--input-type=module',
      '--eval',
      'process.stderr.write("broken service"); process.exit(7)',
    ])

    await expect(result).rejects.toMatchObject({
      commandExitCode: 7,
      details: ['broken service'],
      exitCode: CliExitCode.Prerequisite,
      name: 'CommandExecutionError',
      stderr: 'broken service',
    })
  })

  it('returns failures when explicitly requested by an inspector', async () => {
    const runner = new NodeCommandRunner()

    const result = await runner.run(
      process.execPath,
      ['--input-type=module', '--eval', 'process.exit(3)'],
      { allowFailure: true },
    )

    expect(result.exitCode).toBe(3)
  })

  it('reports the signal that terminated a child process', async () => {
    const result = new NodeCommandRunner().run(process.execPath, [
      '--input-type=module',
      '--eval',
      'process.kill(process.pid, "SIGTERM")',
    ])

    await expect(result).rejects.toMatchObject({
      commandExitCode: null,
      commandSignal: 'SIGTERM',
      message: expect.stringContaining('after signal SIGTERM'),
    })
  })

  it('wraps process spawn errors as command execution errors', async () => {
    const runner = new NodeCommandRunner('/missing')

    await expect(runner.run('/definitely/missing/bitveins-command'))
      .rejects.toBeInstanceOf(CommandExecutionError)
  })

  it('resolves only executable files from its configured PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-command-path-'))
    temporaryDirectories.push(directory)
    const executable = join(directory, 'available-command')
    const regular = join(directory, 'regular-file')
    await Promise.all([
      writeFile(executable, '#!/bin/sh\n'),
      writeFile(regular, ''),
    ])
    await chmod(executable, 0o755)
    const runner = new NodeCommandRunner(directory)

    await expect(runner.which('available-command')).resolves.toBe(executable)
    await expect(runner.which('regular-file')).resolves.toBeNull()
    await expect(runner.which('missing')).resolves.toBeNull()
  })
})
