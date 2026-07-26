import { describe, expect, it } from 'vitest'
import {
  ACCENT_COLOR_PRESETS,
  DEFAULT_ACCENT_COLOR,
  accentColorsForScheme,
  accentCssVariables,
  contrastForeground,
  mixHexColors,
  parseAccentColor,
  relativeLuminance,
} from '../../../app/utils/accent-colors'

describe('accent colors', () => {
  it('offers the curated Tailwind palette and validates stored choices', () => {
    expect(ACCENT_COLOR_PRESETS.map(preset => preset.id)).toEqual([
      'indigo',
      'blue',
      'sky',
      'cyan',
      'emerald',
      'amber',
      'orange',
      'rose',
      'fuchsia',
    ])
    expect(parseAccentColor('emerald')).toBe('emerald')
    expect(parseAccentColor('unknown')).toBe(DEFAULT_ACCENT_COLOR)
    expect(parseAccentColor(null)).toBe(DEFAULT_ACCENT_COLOR)
  })

  it('chooses the foreground with the stronger measured contrast', () => {
    expect(relativeLuminance('#111827')).toBeLessThan(relativeLuminance('#fbbf24'))
    expect(contrastForeground('#1d4ed8')).toBe('#ffffff')
    expect(contrastForeground('#fbbf24')).toBe('#111827')
  })

  it('maps the selected scheme to shared Bitveins and Nuxt UI variables', () => {
    const colors = accentColorsForScheme('amber', 'dark')
    expect(colors).toEqual({
      accent: '#fbbf24',
      contrast: '#111827',
      strong: '#fcd34d',
    })
    expect(accentCssVariables(colors)).toEqual({
      '--bitveins-shell-accent': '#fbbf24',
      '--bitveins-shell-accent-strong': '#fcd34d',
      '--bitveins-shell-accent-soft': 'color-mix(in srgb, #fbbf24 14%, transparent)',
      '--bitveins-accent-contrast': '#111827',
      '--ui-primary': '#fbbf24',
    })
  })

  it('mixes terminal selection colors deterministically', () => {
    expect(mixHexColors('#ffffff', '#000000', 0.25)).toBe('#404040')
    expect(mixHexColors('#ffffff', '#000000', 2)).toBe('#ffffff')
  })
})
