import { describe, expect, it } from 'vitest'
import {
  darkTerminalTheme,
  lightTerminalTheme,
  terminalThemeForAccent,
} from '../../../app/terminal/terminal-theme'

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

  it('derives cursor and selection accents without replacing semantic ANSI colors', () => {
    const amber = terminalThemeForAccent('dark', 'amber')
    expect(amber.cursor).toBe('#fbbf24')
    expect(amber.brightBlue).toBe('#fbbf24')
    expect(amber.selectionBackground).toBe('#715c24')
    expect(amber.green).toBe(darkTerminalTheme.green)
    expect(amber.yellow).toBe(darkTerminalTheme.yellow)
  })
})
