import { describe, expect, it } from 'vitest'
import {
  normalizeHelperSessionName,
  normalizePaneId,
  normalizePaneSize,
  normalizeSessionName,
  normalizeTerminalTarget,
  normalizeTerminalTargetName,
  normalizeWindowIndex,
  normalizeWindowName,
} from '../../../../../server/modules/sessions/model/session-validation'

describe('tmux session normalization', () => {
  it('rejects reserved Bitveins helper session names', () => {
    expect(() => normalizeSessionName('_bitveins_helper')).toThrow('Session names starting with _bitveins_ are reserved.')
  })

  it('rejects colons to avoid ambiguous tmux targets', () => {
    expect(() => normalizeSessionName('work:prod')).toThrow('Session names may contain letters, numbers, underscores, dots, and hyphens only.')
  })

  it('requires string session and helper names', () => {
    expect(() => normalizeSessionName(null)).toThrow('A session name is required.')
    expect(() => normalizeHelperSessionName(42)).toThrow('A session name is required.')
  })

  it('accepts only reserved helper session names', () => {
    expect(normalizeHelperSessionName(' _bitveins_helper ')).toBe('_bitveins_helper')
    expect(() => normalizeHelperSessionName('main')).toThrow('Refusing to kill a non-Bitveins helper session.')
  })

  it('accepts validated public and helper names for owned terminal targets', () => {
    expect(normalizeTerminalTargetName('main')).toBe('main')
    expect(normalizeTerminalTargetName('_bitveins_helper')).toBe('_bitveins_helper')
    expect(() => normalizeTerminalTargetName('main:1')).toThrow('Session names may contain')
    expect(() => normalizeTerminalTargetName(null)).toThrow('A session name is required.')
  })

  it('validates stable pane targets and pane dimensions', () => {
    expect(normalizePaneId('%7')).toBe('%7')
    expect(() => normalizePaneId('7')).toThrow('A valid tmux pane id is required.')
    expect(() => normalizePaneId(null)).toThrow('A valid tmux pane id is required.')
    expect(normalizePaneSize(2)).toBe(2)
    expect(normalizePaneSize('1000')).toBe(1000)
    expect(() => normalizePaneSize(1)).toThrow('A valid tmux pane size is required.')
    expect(() => normalizePaneSize(1001)).toThrow('A valid tmux pane size is required.')
  })

  it('accepts both session names and stable pane ids as terminal targets', () => {
    expect(normalizeTerminalTarget('main')).toBe('main')
    expect(normalizeTerminalTarget('%7')).toBe('%7')
  })
})

describe('tmux window name normalization', () => {
  it('trims window names', () => {
    expect(normalizeWindowName('  editor  ')).toBe('editor')
  })

  it('rejects empty and control-character window names', () => {
    expect(() => normalizeWindowName('   ')).toThrow('Window names must be 1-80 characters and cannot contain control characters.')
    expect(() => normalizeWindowName('bad\nname')).toThrow('Window names must be 1-80 characters and cannot contain control characters.')
  })

  it('requires a string window name', () => {
    expect(() => normalizeWindowName(undefined)).toThrow('A window name is required.')
  })
})

describe('tmux window index normalization', () => {
  it('accepts numeric values and rejects invalid bounds', () => {
    expect(normalizeWindowIndex('12')).toBe(12)
    expect(normalizeWindowIndex(0)).toBe(0)
    expect(() => normalizeWindowIndex(-1)).toThrow('A valid tmux window index is required.')
    expect(() => normalizeWindowIndex(1000)).toThrow('A valid tmux window index is required.')
    expect(() => normalizeWindowIndex('invalid')).toThrow('A valid tmux window index is required.')
  })
})
