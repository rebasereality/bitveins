import { describe, expect, it } from 'vitest'
import { createTerminalOutputNormalizer } from '../../../app/terminal/terminal-output-normalizer'

const DARK_TEXT = '\x1b[38;5;234m'
const DARK_SURFACE = '\x1b[48;5;234m'
const DEFAULT_TEXT = '\x1b[39m'

describe('terminal output normalizer', () => {
  it('replaces unreadable ANSI 234 foreground text in dark mode', () => {
    const normalizer = createTerminalOutputNormalizer(() => true)

    expect(normalizer.normalize(`before${DARK_TEXT}response${DEFAULT_TEXT}after`))
      .toBe(`before${DEFAULT_TEXT}response${DEFAULT_TEXT}after`)
  })

  it('preserves ANSI 234 backgrounds in dark mode', () => {
    const normalizer = createTerminalOutputNormalizer(() => true)

    expect(normalizer.normalize(`${DARK_SURFACE}status`)).toBe(`${DARK_SURFACE}status`)
  })

  it('uses the default foreground in light mode so the text follows theme changes', () => {
    const normalizer = createTerminalOutputNormalizer(() => true)

    expect(normalizer.normalize(`${DARK_TEXT}response`)).toBe(`${DEFAULT_TEXT}response`)
  })

  it('normalizes a foreground sequence split at every output chunk boundary', () => {
    for (let split = 1; split < DARK_TEXT.length; split += 1) {
      const normalizer = createTerminalOutputNormalizer(() => true)
      const output = normalizer.normalize(`before${DARK_TEXT.slice(0, split)}`)
        + normalizer.normalize(`${DARK_TEXT.slice(split)}response`)

      expect(output).toBe(`before${DEFAULT_TEXT}response`)
    }
  })

  it('leaves non-Hermes terminal output unchanged', () => {
    const normalizer = createTerminalOutputNormalizer(() => false)

    expect(normalizer.normalize(`${DARK_TEXT}response`)).toBe(`${DARK_TEXT}response`)
  })

  it('drops a pending escape prefix when the logical output stream resets', () => {
    const normalizer = createTerminalOutputNormalizer(() => true)

    expect(normalizer.normalize(`before${DARK_TEXT.slice(0, -1)}`)).toBe('before')
    normalizer.reset()
    expect(normalizer.normalize('next-stream')).toBe('next-stream')
  })
})
