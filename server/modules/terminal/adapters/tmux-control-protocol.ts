export function decodeTmuxControlValue(value: string): string {
  return value.replace(/\\([0-7]{3})/gu, (_match, octal: string) => (
    String.fromCharCode(Number.parseInt(octal, 8))
  ))
}

export function parseTmuxPaneOutput(line: string): { paneId: string, data: string } | null {
  const output = /^%output (%\d+) (.*)$/u.exec(line)
  if (output) {
    return { paneId: output[1]!, data: decodeTmuxControlValue(output[2]!) }
  }

  const extended = /^%extended-output (%\d+) \d+ : (.*)$/u.exec(line)
  return extended
    ? { paneId: extended[1]!, data: decodeTmuxControlValue(extended[2]!) }
    : null
}
