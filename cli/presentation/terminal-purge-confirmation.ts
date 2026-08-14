import { createInterface } from 'node:readline/promises'
import { CliUsageError } from '../core/cli-error'

export interface PurgeConfirmationPrompt {
  ask(): Promise<string>
  isInteractive(): boolean
}

export function createTerminalPurgeConfirmationPrompt(options: {
  input?: NodeJS.ReadableStream & { isTTY?: boolean }
  output?: NodeJS.WritableStream & { isTTY?: boolean }
} = {}): PurgeConfirmationPrompt {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  return {
    async ask() {
      const terminal = createInterface({
        input,
        output,
      })
      try {
        return await terminal.question(
          'Type REMOVE to delete Bitveins configuration and data: ',
        )
      }
      finally {
        terminal.close()
      }
    },
    isInteractive() {
      return Boolean(input.isTTY && output.isTTY)
    },
  }
}

const terminalPrompt = createTerminalPurgeConfirmationPrompt()

export async function confirmPurge(
  prompt: PurgeConfirmationPrompt = terminalPrompt,
): Promise<boolean> {
  if (!prompt.isInteractive()) {
    throw new CliUsageError('Interactive confirmation is required for --purge.')
  }

  return await prompt.ask() === 'REMOVE'
}
