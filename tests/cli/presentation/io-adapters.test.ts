import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { ConsoleOutput } from '../../../cli/presentation/console-output'
import {
  confirmPurge,
  type PurgeConfirmationPrompt,
} from '../../../cli/presentation/terminal-purge-confirmation'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CLI I/O adapters', () => {
  it('routes normal and diagnostic output to the correct stream', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(
      () => true,
    )
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(
      () => true,
    )
    const output = new ConsoleOutput()

    output.info('information')
    output.success('completed')
    output.error('failure')
    output.diagnostic('details')

    expect(stdout.mock.calls.map(call => call[0])).toEqual([
      'information\n',
      '✓ completed\n',
    ])
    expect(stderr.mock.calls.map(call => call[0])).toEqual([
      'error: failure\n',
      'details\n',
    ])
  })

  it('requires an interactive terminal and an exact purge confirmation', async () => {
    await expect(confirmPurge()).rejects.toThrow(
      /Interactive confirmation is required/,
    )

    const prompt = (answer: string): PurgeConfirmationPrompt => ({
      ask: async () => answer,
      isInteractive: () => true,
    })
    await expect(confirmPurge(prompt('REMOVE'))).resolves.toBe(true)
    await expect(confirmPurge(prompt('remove'))).resolves.toBe(false)
  })

  it('runs terminalPrompt with readline when interactive', async () => {
    const { createTerminalPurgeConfirmationPrompt } = await import('../../../cli/presentation/terminal-purge-confirmation')
    const { Readable, Writable } = await import('node:stream')

    const input = Readable.from(['REMOVE\n']) as any
    input.isTTY = true
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    }) as any
    output.isTTY = true

    const prompt = createTerminalPurgeConfirmationPrompt({ input, output })
    await expect(confirmPurge(prompt)).resolves.toBe(true)
  })
})
