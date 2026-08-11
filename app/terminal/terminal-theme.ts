import type { ITheme } from '@xterm/xterm'
import {
  accentColorsForScheme,
  mixHexColors,
  type AccentColorId,
  type AppearanceColorScheme,
} from '~/utils/accent-colors'

function lightExtendedAnsi(): string[] {
  const colors: string[] = []
  // Hermes uses ANSI 220 for its frame and ANSI 230 for response text.
  // Their default yellows are too pale against the light terminal canvas.
  colors[220 - 16] = '#a16207'
  colors[230 - 16] = '#713f12'
  // Codex uses ANSI 234 and 235 for input surfaces across CLI versions. Keep
  // those extended surfaces readable without changing the regular ANSI palette.
  colors[234 - 16] = '#e2e8f0'
  colors[235 - 16] = '#e2e8f0'
  return colors
}

export const darkTerminalTheme: ITheme = {
  background: '#1c1f24',
  foreground: '#dfe2e8',
  cursor: '#818cf8',
  cursorAccent: '#1c1f24',
  selectionBackground: '#455684',
  selectionForeground: '#f8fafc',
  selectionInactiveBackground: '#30343b',
  black: '#111318',
  red: '#fb7185',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#7aa2f7',
  magenta: '#f472b6',
  cyan: '#22d3ee',
  white: '#e5e7eb',
  brightBlack: '#737985',
  brightRed: '#f43f5e',
  brightGreen: '#10b981',
  brightYellow: '#f59e0b',
  brightBlue: '#818cf8',
  brightMagenta: '#ec4899',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
}

export const lightTerminalTheme: ITheme = {
  background: '#fafafb',
  foreground: '#24262b',
  cursor: '#4f46e5',
  cursorAccent: '#fafafb',
  selectionBackground: '#cdd6f4',
  selectionForeground: '#17191d',
  selectionInactiveBackground: '#dde0e7',
  black: '#17191d',
  red: '#c2410c',
  green: '#047857',
  yellow: '#854d0e',
  blue: '#4338ca',
  magenta: '#be185d',
  cyan: '#0e7490',
  white: '#525866',
  brightBlack: '#6f7580',
  brightRed: '#dc2626',
  brightGreen: '#059669',
  brightYellow: '#a16207',
  brightBlue: '#4f46e5',
  brightMagenta: '#db2777',
  brightCyan: '#0891b2',
  brightWhite: '#0f172a',
  extendedAnsi: lightExtendedAnsi(),
}

export function terminalThemeForAccent(
  colorScheme: AppearanceColorScheme,
  accentColor: AccentColorId,
): ITheme {
  const baseTheme = colorScheme === 'light' ? lightTerminalTheme : darkTerminalTheme
  const accent = accentColorsForScheme(accentColor, colorScheme)
  const background = String(baseTheme.background)

  return {
    ...baseTheme,
    blue: colorScheme === 'light' ? accent.strong : baseTheme.blue,
    brightBlue: accent.accent,
    cursor: accent.accent,
    selectionBackground: mixHexColors(
      accent.accent,
      background,
      colorScheme === 'light' ? 0.24 : 0.38,
    ),
  }
}
