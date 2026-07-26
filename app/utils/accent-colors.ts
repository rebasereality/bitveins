export type AccentColorId
  = | 'indigo'
    | 'blue'
    | 'sky'
    | 'cyan'
    | 'emerald'
    | 'amber'
    | 'orange'
    | 'rose'
    | 'fuchsia'

export type AppearanceColorScheme = 'light' | 'dark'

export interface AccentColorValues {
  accent: string
  contrast: '#ffffff' | '#111827'
  strong: string
}

export interface AccentColorPreset {
  dark: Pick<AccentColorValues, 'accent' | 'strong'>
  id: AccentColorId
  label: string
  light: Pick<AccentColorValues, 'accent' | 'strong'>
  tailwindColor: AccentColorId
}

export const ACCENT_COLOR_STORAGE_KEY = 'bitveins.appearance.accent'
export const DEFAULT_ACCENT_COLOR: AccentColorId = 'indigo'

export const ACCENT_COLOR_PRESETS: readonly AccentColorPreset[] = [
  {
    id: 'indigo',
    label: 'Indigo',
    tailwindColor: 'indigo',
    light: { accent: '#4f46e5', strong: '#4338ca' },
    dark: { accent: '#818cf8', strong: '#a5b4fc' },
  },
  {
    id: 'blue',
    label: 'Blue',
    tailwindColor: 'blue',
    light: { accent: '#2563eb', strong: '#1d4ed8' },
    dark: { accent: '#60a5fa', strong: '#93c5fd' },
  },
  {
    id: 'sky',
    label: 'Sky',
    tailwindColor: 'sky',
    light: { accent: '#0284c7', strong: '#0369a1' },
    dark: { accent: '#38bdf8', strong: '#7dd3fc' },
  },
  {
    id: 'cyan',
    label: 'Cyan',
    tailwindColor: 'cyan',
    light: { accent: '#0891b2', strong: '#0e7490' },
    dark: { accent: '#22d3ee', strong: '#67e8f9' },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    tailwindColor: 'emerald',
    light: { accent: '#059669', strong: '#047857' },
    dark: { accent: '#34d399', strong: '#6ee7b7' },
  },
  {
    id: 'amber',
    label: 'Amber',
    tailwindColor: 'amber',
    light: { accent: '#d97706', strong: '#b45309' },
    dark: { accent: '#fbbf24', strong: '#fcd34d' },
  },
  {
    id: 'orange',
    label: 'Orange',
    tailwindColor: 'orange',
    light: { accent: '#ea580c', strong: '#c2410c' },
    dark: { accent: '#fb923c', strong: '#fdba74' },
  },
  {
    id: 'rose',
    label: 'Rose',
    tailwindColor: 'rose',
    light: { accent: '#e11d48', strong: '#be123c' },
    dark: { accent: '#fb7185', strong: '#fda4af' },
  },
  {
    id: 'fuchsia',
    label: 'Fuchsia',
    tailwindColor: 'fuchsia',
    light: { accent: '#c026d3', strong: '#a21caf' },
    dark: { accent: '#e879f9', strong: '#f0abfc' },
  },
] as const

const accentPresetsById = new Map(
  ACCENT_COLOR_PRESETS.map(preset => [preset.id, preset]),
)

function linearizedChannel(channel: number): number {
  const value = channel / 255
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4
}

function hexChannels(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, '')
  if (!/^[\da-f]{6}$/i.test(normalized)) {
    throw new Error(`Unsupported color value: ${hex}`)
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

export function relativeLuminance(hex: string): number {
  const [redChannel, greenChannel, blueChannel] = hexChannels(hex)
  const red = linearizedChannel(redChannel)
  const green = linearizedChannel(greenChannel)
  const blue = linearizedChannel(blueChannel)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastForeground(hex: string): '#ffffff' | '#111827' {
  const backgroundLuminance = relativeLuminance(hex)
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05)
  const darkLuminance = relativeLuminance('#111827')
  const darkContrast = (backgroundLuminance + 0.05) / (darkLuminance + 0.05)
  return whiteContrast >= darkContrast ? '#ffffff' : '#111827'
}

export function isAccentColorId(value: unknown): value is AccentColorId {
  return typeof value === 'string' && accentPresetsById.has(value as AccentColorId)
}

export function parseAccentColor(value: string | null): AccentColorId {
  return isAccentColorId(value) ? value : DEFAULT_ACCENT_COLOR
}

export function accentColorPreset(id: AccentColorId): AccentColorPreset {
  return accentPresetsById.get(id) ?? accentPresetsById.get(DEFAULT_ACCENT_COLOR)!
}

export function accentColorsForScheme(
  id: AccentColorId,
  scheme: AppearanceColorScheme,
): AccentColorValues {
  const colors = accentColorPreset(id)[scheme]
  return {
    ...colors,
    contrast: contrastForeground(colors.accent),
  }
}

export function mixHexColors(
  foreground: string,
  background: string,
  foregroundWeight: number,
): string {
  const foregroundChannels = hexChannels(foreground)
  const backgroundChannels = hexChannels(background)
  const weight = Math.min(1, Math.max(0, foregroundWeight))
  const mixed = foregroundChannels.map((channel, index) => (
    Math.round(channel * weight + backgroundChannels[index]! * (1 - weight))
  ))
  return `#${mixed.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

export function accentCssVariables(colors: AccentColorValues): Record<string, string> {
  return {
    '--bitveins-shell-accent': colors.accent,
    '--bitveins-shell-accent-strong': colors.strong,
    '--bitveins-shell-accent-soft': `color-mix(in srgb, ${colors.accent} 14%, transparent)`,
    '--bitveins-accent-contrast': colors.contrast,
    '--ui-primary': colors.accent,
  }
}
