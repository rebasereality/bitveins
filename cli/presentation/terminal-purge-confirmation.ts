import { createInterface } from 'node:readline/promises'
import { CliUsageError } from '../core/cli-error'

export interface PurgeConfirmationPrompt {
  ask(): Promise<string>
  isInteractive(): boolean
}

const terminalPrompt: PurgeConfirmationPrompt = {
  async ask() {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
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
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
  },
}

export async function confirmPurge(
  prompt: PurgeConfirmationPrompt = terminalPrompt,
): Promise<boolean> {
  if (!prompt.isInteractive()) {
    throw new CliUsageError('Interactive confirmation is required for --purge.')
  }

  return await prompt.ask() === 'REMOVE'
}
