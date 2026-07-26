import {
  describe,
  expect,
  it,
} from 'vitest'
import { CommandArguments, extractGlobalVerbose } from '../../../cli/presentation/command-parser'

describe('CommandArguments', () => {
  it('parses typed option shapes without mutating the source arguments', () => {
    const source = ['--port', '3456', '--follow', 'session']
    const parser = new CommandArguments(source)

    expect(parser.value('--port')).toBe('3456')
    expect(parser.flag('--follow')).toBe(true)
    expect(parser.positional('session')).toBe('session')
    expect(() => parser.done()).not.toThrow()
    expect(source).toEqual(['--port', '3456', '--follow', 'session'])
  })

  it.each([
    {
      apply: (parser: CommandArguments) => parser.value('--port'),
      args: ['--port'],
      message: '--port requires a value.',
    },
    {
      apply: (parser: CommandArguments) => parser.value('--port'),
      args: ['--port', '3000', '--port', '4000'],
      message: '--port may only be provided once.',
    },
    {
      apply: (parser: CommandArguments) => parser.flag('--follow'),
      args: ['--follow', '--follow'],
      message: '--follow may only be provided once.',
    },
  ])('rejects ambiguous option input: $message', ({ apply, args, message }) => {
    expect(() => apply(new CommandArguments(args))).toThrow(message)
  })
})

describe('extractGlobalVerbose', () => {
  it('extracts one global verbose flag from any argument position', () => {
    expect(extractGlobalVerbose(['update', '--verbose', '--version', '1.2.3']))
      .toEqual({
        args: ['update', '--version', '1.2.3'],
        verbose: true,
      })
  })

  it('rejects duplicate verbose flags', () => {
    expect(() => extractGlobalVerbose(['--verbose', 'doctor', '--verbose']))
      .toThrow('--verbose may only be provided once.')
  })
})
