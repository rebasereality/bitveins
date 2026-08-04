const hermesProfilePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u

export function isValidHermesProfileName(value: string): boolean {
  return hermesProfilePattern.test(value)
}
