import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE_PROFILES,
  DEFAULT_APPEARANCE_SETTINGS,
  appearanceSettingsCssVariables,
  parseAppearanceProfiles,
  parseAppearanceSettings,
  parsePromptMonospace,
  terminalFontSizesForDevice,
} from '../../../app/utils/appearance-settings'

describe('appearance settings', () => {
  it('uses the compact defaults for missing or malformed storage', () => {
    expect(parseAppearanceSettings(null)).toEqual(DEFAULT_APPEARANCE_SETTINGS)
    expect(parseAppearanceSettings('{broken')).toEqual(DEFAULT_APPEARANCE_SETTINGS)
  })

  it('keeps valid scales and resets invalid properties independently', () => {
    expect(parseAppearanceSettings(JSON.stringify({
      interfaceScale: 4,
      terminalScale: -1,
      inputScale: 2,
    }))).toEqual({
      interfaceScale: 4,
      terminalScale: 0,
      inputScale: 2,
    })
  })

  it('stores desktop and mobile profiles independently', () => {
    expect(parseAppearanceProfiles(JSON.stringify({
      desktop: {
        interfaceScale: 2,
        terminalScale: 4,
        inputScale: 3,
      },
      mobile: {
        interfaceScale: 1,
        terminalScale: 2,
        inputScale: 1,
      },
    }), null, 'desktop')).toEqual({
      desktop: {
        interfaceScale: 2,
        terminalScale: 4,
        inputScale: 3,
      },
      mobile: {
        interfaceScale: 1,
        terminalScale: 2,
        inputScale: 1,
      },
    })
  })

  it('migrates the legacy preference into the device that discovers it', () => {
    expect(parseAppearanceProfiles(null, JSON.stringify({
      interfaceScale: 3,
      terminalScale: 2,
      inputScale: 1,
    }), 'mobile')).toEqual({
      desktop: DEFAULT_APPEARANCE_PROFILES.desktop,
      mobile: {
        interfaceScale: 3,
        terminalScale: 2,
        inputScale: 1,
      },
    })
  })

  it('uses device-specific terminal presets', () => {
    expect(terminalFontSizesForDevice('desktop')).toEqual([13, 14, 15, 16, 18])
    expect(terminalFontSizesForDevice('mobile')).toEqual([14, 15, 16, 17, 19])
  })

  it('enables the prompt monospace default and validates stored booleans', () => {
    expect(parsePromptMonospace(null)).toBe(true)
    expect(parsePromptMonospace('true')).toBe(true)
    expect(parsePromptMonospace('false')).toBe(false)
    expect(parsePromptMonospace('"false"')).toBe(true)
    expect(parsePromptMonospace('{broken')).toBe(true)
  })

  it('maps the three scales to independent CSS values', () => {
    expect(appearanceSettingsCssVariables({
      interfaceScale: 1,
      terminalScale: 4,
      inputScale: 3,
    })).toMatchObject({
      '--bitveins-ui-font-size': '13px',
      '--bitveins-ui-label-size': '12px',
      '--bitveins-input-font-size': '22px',
      '--bitveins-input-line-height': '33px',
      '--bitveins-input-min-height': '80px',
    })
  })
})
