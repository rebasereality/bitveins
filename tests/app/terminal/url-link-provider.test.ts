// @vitest-environment happy-dom

import type { IBufferLine, ILink } from '@xterm/xterm'
import { describe, expect, it, vi } from 'vitest'
import {
  parseTerminalUrls,
  TerminalUrlLinkProvider,
} from '~/terminal/url-link-provider'

function fakeLine(text: string, isWrapped = false, length = text.length): IBufferLine {
  return {
    isWrapped,
    length,
    getCell(index) {
      if (index >= length) return undefined
      return {
        getChars: () => text[index] || '',
        getWidth: () => 1,
      }
    },
    translateToString: () => text.trimEnd(),
  } as IBufferLine
}

function fakeTerminal(lines: IBufferLine[]) {
  return {
    buffer: {
      active: {
        getLine: (index: number) => lines[index],
      },
    },
  }
}

function providedLinks(provider: TerminalUrlLinkProvider, line = 1): Promise<ILink[] | undefined> {
  return new Promise(resolve => provider.provideLinks(line, resolve))
}

describe('parseTerminalUrls', () => {
  it('accepts HTTP(S), preserves URL punctuation, and removes prose punctuation', () => {
    expect(parseTerminalUrls('See https://example.com/docs?q=hello#intro, then http://localhost:3000/a_(b).'))
      .toEqual([
        {
          startIndex: 4,
          endIndex: 42,
          text: 'https://example.com/docs?q=hello#intro',
          url: 'https://example.com/docs?q=hello#intro',
        },
        {
          startIndex: 49,
          endIndex: 76,
          text: 'http://localhost:3000/a_(b)',
          url: 'http://localhost:3000/a_(b)',
        },
      ])
  })

  it('recognizes bare IPv4 addresses and defaults them to HTTP', () => {
    expect(parseTerminalUrls('Open 127.0.0.1:3000, then 192.168.1.20/docs?q=1#top.'))
      .toEqual([
        {
          startIndex: 5,
          endIndex: 19,
          text: '127.0.0.1:3000',
          url: 'http://127.0.0.1:3000/',
        },
        {
          startIndex: 26,
          endIndex: 51,
          text: '192.168.1.20/docs?q=1#top',
          url: 'http://192.168.1.20/docs?q=1#top',
        },
      ])
  })

  it('ignores unsupported schemes and malformed or oversized values', () => {
    expect(parseTerminalUrls('javascript:alert(1) ftp://example.com mailto:test@example.com')).toEqual([])
    expect(parseTerminalUrls('999.1.1.1 127.0.0.1:70000 v1.2.3.4')).toEqual([])
    expect(parseTerminalUrls(`https://example.com/${'a'.repeat(2_100)}`)).toEqual([])
  })
})

describe('TerminalUrlLinkProvider', () => {
  it('maps wrapped URLs and opens them only with Ctrl/Cmd', async () => {
    const activate = vi.fn()
    const provider = new TerminalUrlLinkProvider({
      terminal: fakeTerminal([
        fakeLine('Visit https://exa', false, 17),
        fakeLine('mple.com/docs.', true, 14),
      ]),
      activate,
    })

    const links = await providedLinks(provider, 2)
    const link = links?.[0]
    expect(link?.text).toBe('https://example.com/docs')
    expect(link?.range).toEqual({ start: { x: 7, y: 1 }, end: { x: 13, y: 2 } })
    expect(link?.decorations).toEqual({ pointerCursor: false, underline: false })

    link?.hover?.(new MouseEvent('mouseenter'), link.text)
    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true }))
    expect(link?.decorations).toEqual({ pointerCursor: true, underline: true })

    link?.activate(new MouseEvent('click'), link.text)
    expect(activate).not.toHaveBeenCalled()
    link?.activate(new MouseEvent('click', { ctrlKey: true }), link.text)
    expect(activate).toHaveBeenCalledWith('https://example.com/docs')

    window.dispatchEvent(new KeyboardEvent('keyup'))
    expect(link?.decorations).toEqual({ pointerCursor: false, underline: false })
    provider.dispose()
  })

  it('omits lines without web URLs and clears modifier styling on blur', async () => {
    const provider = new TerminalUrlLinkProvider({
      terminal: fakeTerminal([fakeLine('plain output')]),
      activate: vi.fn(),
    })
    await expect(providedLinks(provider)).resolves.toBeUndefined()

    window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true }))
    window.dispatchEvent(new Event('blur'))
    provider.dispose()
    provider.dispose()
  })
})
