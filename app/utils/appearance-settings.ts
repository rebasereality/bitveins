export type AppearanceScale = 0 | 1 | 2 | 3 | 4
export type AppearanceScaleKey = 'interfaceScale' | 'terminalScale' | 'inputScale'
export type AppearanceDevice = 'desktop' | 'mobile'

export interface AppearanceSettings {
  interfaceScale: AppearanceScale
  terminalScale: AppearanceScale
  inputScale: AppearanceScale
}

export interface AppearanceProfiles {
  desktop: AppearanceSettings
  mobile: AppearanceSettings
}

export const APPEARANCE_STORAGE_KEY = 'bitveins.appearance.v2'
export const LEGACY_APPEARANCE_STORAGE_KEY = 'bitveins.appearance.v1'
export const APPEARANCE_SCALE_LABELS = ['Compact', 'Small', 'Medium', 'Large', 'Extra large'] as const
export const INTERFACE_FONT_SIZES = [12, 13, 14, 15, 16] as const
export const DESKTOP_TERMINAL_FONT_SIZES = [13, 14, 15, 16, 18] as const
export const MOBILE_TERMINAL_FONT_SIZES = [14, 15, 16, 17, 19] as const
export const INPUT_FONT_SIZES = [16, 18, 20, 22, 24] as const
export const INPUT_LINE_HEIGHTS = [24, 27, 30, 33, 36] as const
export const INPUT_MIN_HEIGHTS = [56, 64, 72, 80, 96] as const
export const PROMPT_MONOSPACE_STORAGE_KEY = 'bitveins.appearance.prompt-monospace'

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  interfaceScale: 0,
  terminalScale: 0,
  inputScale: 0,
}

export const DEFAULT_APPEARANCE_PROFILES: AppearanceProfiles = {
  desktop: { ...DEFAULT_APPEARANCE_SETTINGS },
  mobile: { ...DEFAULT_APPEARANCE_SETTINGS },
}

export function isAppearanceScale(value: unknown): value is AppearanceScale {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4
}

function parseAppearanceSettingsValue(value: unknown): AppearanceSettings {
  const parsed = value && typeof value === 'object'
    ? value as Partial<AppearanceSettings>
    : {}

  return {
    interfaceScale: isAppearanceScale(parsed.interfaceScale) ? parsed.interfaceScale : 0,
    terminalScale: isAppearanceScale(parsed.terminalScale) ? parsed.terminalScale : 0,
    inputScale: isAppearanceScale(parsed.inputScale) ? parsed.inputScale : 0,
  }
}

export function parseAppearanceSettings(raw: string | null): AppearanceSettings {
  if (!raw) return { ...DEFAULT_APPEARANCE_SETTINGS }
  try {
    return parseAppearanceSettingsValue(JSON.parse(raw))
  }
  catch {
    return { ...DEFAULT_APPEARANCE_SETTINGS }
  }
}

export function parseAppearanceProfiles(
  raw: string | null,
  legacyRaw: string | null,
  legacyDevice: AppearanceDevice,
): AppearanceProfiles {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Record<AppearanceDevice, unknown>>
      return {
        desktop: parseAppearanceSettingsValue(parsed.desktop),
        mobile: parseAppearanceSettingsValue(parsed.mobile),
      }
    }
    catch {
      // Fall through to the legacy preference or compact defaults.
    }
  }

  const profiles: AppearanceProfiles = {
    desktop: { ...DEFAULT_APPEARANCE_SETTINGS },
    mobile: { ...DEFAULT_APPEARANCE_SETTINGS },
  }
  if (legacyRaw) profiles[legacyDevice] = parseAppearanceSettings(legacyRaw)
  return profiles
}

export function terminalFontSizesForDevice(device: AppearanceDevice) {
  return device === 'mobile' ? MOBILE_TERMINAL_FONT_SIZES : DESKTOP_TERMINAL_FONT_SIZES
}

export function parsePromptMonospace(raw: string | null): boolean {
  if (raw === null) return true
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'boolean' ? parsed : true
  }
  catch {
    return true
  }
}

export function appearanceSettingsCssVariables(settings: AppearanceSettings): Record<string, string> {
  const interfaceSize = INTERFACE_FONT_SIZES[settings.interfaceScale]
  const inputSize = INPUT_FONT_SIZES[settings.inputScale]

  return {
    '--bitveins-ui-font-size': `${interfaceSize}px`,
    '--bitveins-ui-label-size': `${Math.max(11, interfaceSize - 1)}px`,
    '--bitveins-ui-caption-size': `${Math.max(10, interfaceSize - 2)}px`,
    '--bitveins-ui-micro-size': `${Math.max(9, interfaceSize - 3)}px`,
    '--bitveins-ui-heading-size': `${interfaceSize + 2}px`,
    '--bitveins-input-font-size': `${inputSize}px`,
    '--bitveins-input-line-height': `${INPUT_LINE_HEIGHTS[settings.inputScale]}px`,
    '--bitveins-input-min-height': `${INPUT_MIN_HEIGHTS[settings.inputScale]}px`,
  }
}
