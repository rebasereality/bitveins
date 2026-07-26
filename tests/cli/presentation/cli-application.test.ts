import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  CliError,
  CliExitCode,
} from '../../../cli/core/cli-error'
import { CliApplication } from '../../../cli/presentation/cli-application'
import type { CliCommand } from '../../../cli/presentation/cli-command'
import { CommandRegistry } from '../../../cli/presentation/command-registry'
import { RecordingCliOutput } from '../support/cli-fakes'

class FakeCommand implements CliCommand {
  readonly aliases = ['alias']
  readonly description = 'Run a fake command.'
  readonly name = 'fake'
  readonly receivedArguments: string[][] = []
  readonly usage = 'bitveins fake [--value <value>]'
  readonly usageDetails = ['--value <value>  A fake value.']

  constructor(
    private readonly implementation: () => Promise<CliExitCode>
      = async () => CliExitCode.Success,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    this.receivedArguments.push([...args])
    return await this.implementation()
  }
}

function fixture(command = new FakeCommand()) {
  const output = new RecordingCliOutput()
  const commands = new CommandRegistry()
  commands.register(command)
  return {
    application: new CliApplication({ commands, output }),
    command,
    commands,
    output,
  }
}

describe('CliApplication', () => {
  it('dispatches aliases and preserves command arguments', async () => {
    const { application, command } = fixture()

    await expect(application.run(['alias', '--value', 'yes']))
      .resolves.toBe(CliExitCode.Success)
    expect(command.receivedArguments).toEqual([['--value', 'yes']])
  })

  it('renders targeted help without executing the command', async () => {
    const { application, command, output } = fixture()

    await expect(application.run(['fake', '--help']))
      .resolves.toBe(CliExitCode.Success)

    expect(command.receivedArguments).toEqual([])
    expect(output.infos.join('\n')).toContain('Run a fake command.')
    expect(output.infos.join('\n')).toContain('--value <value>')
  })

  it('uses a stable usage exit code and remediation for unknown commands', async () => {
    const { application, output } = fixture()

    await expect(application.run(['missing']))
      .resolves.toBe(CliExitCode.Usage)

    expect(output.errors).toEqual(['Unknown Bitveins command: missing'])
    expect(output.diagnostics).toEqual([
      'hint: Run bitveins help to list the available commands.',
    ])
  })

  it('does not expose stack traces for unexpected errors by default', async () => {
    const { application, output } = fixture(new FakeCommand(async () => {
      throw new Error('unexpected failure')
    }))

    await expect(application.run(['fake']))
      .resolves.toBe(CliExitCode.Failure)

    expect(output.errors).toEqual(['unexpected failure'])
    expect(output.diagnostics).toEqual([])
  })

  it('prints redacted details and causes in verbose mode', async () => {
    const cause = new Error('NUXT_SESSION_PASSWORD=super-secret')
    const { application, output } = fixture(new FakeCommand(async () => {
      throw new CliError('service failed', {
        cause,
        details: ['BITVEINS_AUTH_PASSWORD_HASH=$scrypt$secret'],
        hint: 'password=do-not-print',
      })
    }))

    await expect(application.run(['fake', '--verbose']))
      .resolves.toBe(CliExitCode.Failure)

    const diagnostics = output.diagnostics.join('\n')
    expect(diagnostics).toContain('BITVEINS_AUTH_PASSWORD_HASH=[REDACTED]')
    expect(diagnostics).toContain('password=[REDACTED]')
    expect(diagnostics).toContain('NUXT_SESSION_PASSWORD=[REDACTED]')
    expect(diagnostics).not.toContain('super-secret')
    expect(diagnostics).not.toContain('$scrypt$secret')
    expect(diagnostics).not.toContain('do-not-print')
  })
})

describe('CommandRegistry', () => {
  it('rejects duplicate names and aliases at composition time', () => {
    const commands = new CommandRegistry()
    commands.register(new FakeCommand())

    expect(() => commands.register(new FakeCommand()))
      .toThrow('Duplicate CLI command or alias: fake')
  })
})
