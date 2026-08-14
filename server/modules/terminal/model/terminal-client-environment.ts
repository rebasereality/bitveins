export type TerminalAppearance = 'dark' | 'light'

export function terminalClientEnvironment(
  hostEnv: Record<string, string | undefined>,
  appearance?: TerminalAppearance,
): Record<string, string | undefined> {
  return {
    ...hostEnv,
    COLORTERM: 'truecolor',
    LC_GROK_THEME: 'auto',
    TERM: 'xterm-256color',
    ...(appearance
      ? {
          COLORFGBG: appearance === 'light' ? '0;15' : '15;0',
          LC_GROK_APPEARANCE: appearance,
        }
      : {}),
  }
}
