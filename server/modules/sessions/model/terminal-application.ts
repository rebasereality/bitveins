import type { TmuxPane } from '#shared/contracts/terminal'

export type TerminalApplication = NonNullable<TmuxPane['application']>

export function detectTerminalApplication(command: string): TerminalApplication | null {
  const name = command.trim().toLowerCase()
  if (name === 'hermes') return 'hermes'
  if (name === 'grok' || name.startsWith('grok-')) return 'grok'
  return null
}

export function parseProcessCommandSnapshot(
  stdout: string,
): Map<number, { command: string, foregroundPid: number }> {
  const processes = new Map<number, { command: string, foregroundPid: number }>()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(-?\d+)\s+(\S+)\s*$/)
    if (!match) continue
    processes.set(Number(match[1]), {
      command: match[3]!,
      foregroundPid: Number(match[2]),
    })
  }
  return processes
}

export function foregroundApplicationForPane(
  panePid: number,
  processes: ReadonlyMap<number, { command: string, foregroundPid: number }>,
): TerminalApplication | null {
  const paneProcess = processes.get(panePid)
  const command = paneProcess ? processes.get(paneProcess.foregroundPid)?.command : undefined
  return command ? detectTerminalApplication(command) : null
}
