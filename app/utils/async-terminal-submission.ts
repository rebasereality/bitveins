export type AsyncTerminalTerminator = '\r' | '\t'

const BRACKETED_PASTE_START = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'

export function asyncTerminalSubmissionChunks(
  command: string,
  terminator: AsyncTerminalTerminator,
): readonly [string, AsyncTerminalTerminator] {
  const input = command
    ? `${BRACKETED_PASTE_START}${command}${BRACKETED_PASTE_END}`
    : ''

  return [input, terminator]
}

export function recoverAsyncTerminalPrompt(chunks: readonly string[]): string {
  const input = chunks.find(chunk => chunk !== '\r' && chunk !== '\t') || ''

  if (input.startsWith(BRACKETED_PASTE_START) && input.endsWith(BRACKETED_PASTE_END)) {
    return input.slice(BRACKETED_PASTE_START.length, -BRACKETED_PASTE_END.length)
  }

  return input
}
