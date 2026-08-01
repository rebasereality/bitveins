import { describe, expect, it } from 'vitest'
import {
  darkTerminalTheme,
  lightTerminalTheme,
  terminalThemeForAccent,
} from '../../../app/terminal/terminal-theme'
import { relativeLuminance } from '../../../app/utils/accent-colors'

function contrastRatio(foreground: string, background: string): number {
  const luminances = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((first, second) => second - first)
  return (luminances[0]! + 0.05) / (luminances[1]! + 0.05)
}

describe('terminal themes', () => {
  it('uses the graphite shell palette for the canvas', () => {
    expect(darkTerminalTheme.background).toBe('#1c1f24')
    expect(darkTerminalTheme.cursor).toBe('#818cf8')
    expect(darkTerminalTheme.selectionBackground).toBe('#455684')
  })

  it('keeps semantic ANSI green and the Codex ANSI 235 light surface intact', () => {
    expect(darkTerminalTheme.green).toBe('#34d399')
    expect(lightTerminalTheme.green).toBe('#047857')
    expect(lightTerminalTheme.extendedAnsi?.[235 - 16]).toBe('#e2e8f0')
  })

  it('keeps yellow terminal text readable on the light canvas', () => {
    const background = String(lightTerminalTheme.background)
    expect(contrastRatio(String(lightTerminalTheme.yellow), background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(String(lightTerminalTheme.brightYellow), background)).toBeGreaterThanOrEqual(4.5)
  })

  it('replaces pale extended ANSI yellows with readable light-theme colors', () => {
    expect(lightTerminalTheme.extendedAnsi?.[220 - 16]).toBe('#a16207')
    expect(lightTerminalTheme.extendedAnsi?.[230 - 16]).toBe('#713f12')
  })

  it('derives cursor and selection accents without replacing semantic ANSI colors', () => {
    const amber = terminalThemeForAccent('dark', 'amber')
    expect(amber.cursor).toBe('#fbbf24')
    expect(amber.brightBlue).toBe('#fbbf24')
    expect(amber.selectionBackground).toBe('#715c24')
    expect(amber.green).toBe(darkTerminalTheme.green)
    expect(amber.yellow).toBe(darkTerminalTheme.yellow)
  })
})
