import { describe, expect, it } from 'vitest'
import {
  classifyAgentScreenStatus,
  stripAgentActivityGlyph,
} from '../../../../../server/modules/agents/model/agent-screen-status'

describe('agent screen status', () => {
  it('prioritizes visible approval prompts over an activity title', () => {
    expect(classifyAgentScreenStatus(
      'codex',
      '⠦ project',
      'Would you like to run the following command?\nYes, and don\'t ask again',
    )).toBe('blocked')
  })

  it('recognizes Antigravity question prompts as blocked', () => {
    expect(classifyAgentScreenStatus(
      'antigravity',
      'bitveins',
      'Select an option:\n1. (Recommended) Proceed\n2. Cancel\nSubmit / Skip',
    )).toBe('blocked')
  })

  it('recognizes strict failures near the bottom of the live screen', () => {
    expect(classifyAgentScreenStatus('hermes', 'project', 'Retrying\nAPI request failed')).toBe('failed')
  })

  it('uses terminal activity glyphs and live interrupt hints for working state', () => {
    expect(classifyAgentScreenStatus('codex', '⠦ project', '$')).toBe('working')
    expect(classifyAgentScreenStatus('claude', 'project', 'Generating\nEsc to interrupt')).toBe('working')
    expect(classifyAgentScreenStatus(
      'antigravity',
      'bitveins',
      '⣽  Working...\n─────────────────\n>\n─────────────────\nesc to cancel   Gemini 3.7 Flash · high',
    )).toBe('working')
    expect(classifyAgentScreenStatus(
      'antigravity',
      'bitveins',
      '\u001B[32m⣽\u001B[0m  \u001B[1mWorking...\u001B[0m\n\u001B[90mesc to cancel\u001B[0m',
    )).toBe('working')
    expect(classifyAgentScreenStatus(
      'antigravity',
      'bitveins',
      'Thinking (High)...\nesc to cancel',
    )).toBe('working')
  })

  it('falls back conservatively for ready and unreadable panes', () => {
    expect(classifyAgentScreenStatus('codex', 'project', 'Ready for your next prompt')).toBe('idle')
    expect(classifyAgentScreenStatus('antigravity', 'bitveins', '>\n─────────────────\nReady for input')).toBe('idle')
    expect(classifyAgentScreenStatus('codex', 'project', null)).toBe('unknown')
  })

  it('removes a leading activity glyph from the display title', () => {
    expect(stripAgentActivityGlyph('  ⠦ bitveins')).toBe('bitveins')
    expect(stripAgentActivityGlyph('  ⣽ bitveins')).toBe('bitveins')
    expect(stripAgentActivityGlyph('\u001B[32m⣽\u001B[0m bitveins')).toBe('bitveins')
    expect(stripAgentActivityGlyph('bitveins')).toBe('bitveins')
  })
})
