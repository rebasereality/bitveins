const OSC_COLOR_REPORT = /^\u001B\]1[012];/u

export function isOscColorReport(data: string): boolean {
  return OSC_COLOR_REPORT.test(data)
}
