// @vitest-environment happy-dom

import type { IBufferLine, ILink } from '@xterm/xterm'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalFileResolution } from '#shared/contracts/explorer'
import {
  readLogicalBufferLine,
  TerminalFileLinkProvider,
} from '~/terminal/file-link-provider'

function fakeLine(text: string, isWrapped = false, length = text.length): IBufferLine {
  return {
    isWrapped,
    length,
    getCell(index) {
      if (index >= length) return undefined
      return {
        getChars: () => text[index] || '',
        getCode: () => text.codePointAt(index) || 0,
        getFgColor: () => 0,
        getBgColor: () => 0,
        getFgColorMode: () => 0,
        getBgColorMode: () => 0,
        getWidth: () => 1,
        isAttributeDefault: () => true,
        isBold: () => false,
        isBlink: () => false,
        isDim: () => false,
        isInverse: () => false,
        isInvisible: () => false,
        isItalic: () => false,
        isOverline: () => false,
        isProtected: () => false,
        isStrikethrough: () => false,
        isUnderline: () => false,
        isFgRGB: () => false,
        isBgRGB: () => false,
        isFgPalette: () => false,
        isBgPalette: () => false,
        isFgDefault: () => true,
        isBgDefault: () => true,
      }
    },
    translateToString: () => text.trimEnd(),
  } as IBufferLine
}

function fakeTerminal(
  lines: IBufferLine[],
): Parameters<typeof readLogicalBufferLine>[0] {
  return {
    buffer: {
      active: {
        getLine: (index: number) => lines[index],
      },
    },
  }
}

function uniqueResolution(path = 'src/file.ts'): TerminalFileResolution {
  return {
    status: 'unique',
    reference: { path },
    document: {
      kind: 'text',
      absolutePath: `/${path}`,
      path,
      name: 'file.ts',
      root: '.',
      size: 4,
    },
  }
}

function ambiguousResolution(path = 'src/file.ts'): TerminalFileResolution {
  const document = uniqueResolution(path)
  if (document.status !== 'unique') throw new Error('Expected a unique fixture.')
  return {
    status: 'ambiguous',
    reference: { path },
    candidates: [
      document.document,
      {
        ...document.document,
        absolutePath: `/other/${path}`,
        path: `other/${path}`,
        root: 'other',
      },
    ],
  }
}

function providedLinks(provider: TerminalFileLinkProvider, line = 1): Promise<ILink[] | undefined> {
  return new Promise(resolve => provider.provideLinks(line, resolve))
}

describe('readLogicalBufferLine', () => {
  it('maps wrapped rows to one logical line with 1-based cells', () => {
    const terminal = fakeTerminal([
      fakeLine('src/f', false, 5),
      fakeLine('ile.ts', true, 6),
    ])

    const logical = readLogicalBufferLine(terminal, 2)
    expect(logical?.text).toBe('src/file.ts')
    expect(logical?.positions[0]).toEqual({ x: 1, y: 1 })
    expect(logical?.positions.at(-1)).toEqual({ x: 6, y: 2 })
    expect(readLogicalBufferLine(terminal, 3)).toBeNull()
  })
})

describe('TerminalFileLinkProvider', () => {
  it('decorates only under Ctrl/Cmd and activates only with the modifier', async () => {
    const activate = vi.fn()
    const resolve = vi.fn().mockResolvedValue([uniqueResolution()])
    const provider = new TerminalFileLinkProvider({
      terminal: fakeTerminal([fakeLine('see src/file.ts')]),
      cacheScope: () => 'project',
      resolve,
      activate,
    })

    const links = await providedLinks(provider)
    const link = links?.[0]
    expect(link?.range).toEqual({ start: { x: 5, y: 1 }, end: { x: 15, y: 1 } })
    expect(link?.decorations).toEqual({ pointerCursor: false, underline: false })

    link?.hover?.(new MouseEvent('mouseenter'), link.text)
    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true }))
    expect(link?.decorations).toEqual({ pointerCursor: true, underline: true })

    link?.activate(new MouseEvent('click'), link.text)
    expect(activate).not.toHaveBeenCalled()
    link?.activate(new MouseEvent('click', { metaKey: true }), link.text)
    expect(activate).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('blur'))
    expect(link?.decorations).toEqual({ pointerCursor: false, underline: false })
    link?.leave?.(new MouseEvent('mouseleave'), link.text)
    link?.dispose?.()
    await providedLinks(provider)
    expect(resolve).toHaveBeenCalledOnce()
    provider.dispose()
    provider.dispose()
  })

  it('decorates links resolved after the modifier is already pressed', async () => {
    const provider = new TerminalFileLinkProvider({
      terminal: fakeTerminal([fakeLine('src/file.ts')]),
      resolve: vi.fn().mockResolvedValue([uniqueResolution()]),
      activate: vi.fn(),
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true }))
    const links = await providedLinks(provider)

    expect(links?.[0]?.decorations).toEqual({
      pointerCursor: true,
      underline: true,
    })

    window.dispatchEvent(new KeyboardEvent('keyup'))
    provider.dispose()
  })

  it('uses a pointer without a solid underline for ambiguous links', async () => {
    const provider = new TerminalFileLinkProvider({
      terminal: fakeTerminal([fakeLine('src/file.ts')]),
      resolve: vi.fn().mockResolvedValue([ambiguousResolution()]),
      activate: vi.fn(),
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true }))
    const links = await providedLinks(provider)

    expect(links?.[0]?.decorations).toEqual({
      pointerCursor: true,
      underline: false,
    })

    window.dispatchEvent(new KeyboardEvent('keyup'))
    provider.dispose()
  })

  it('omits missing, unparsable and failed resolutions', async () => {
    const noReference = new TerminalFileLinkProvider({
      terminal: fakeTerminal([fakeLine('plain output')]),
      resolve: vi.fn(),
      activate: vi.fn(),
    })
    await expect(providedLinks(noReference)).resolves.toBeUndefined()
    noReference.dispose()

    const missing = new TerminalFileLinkProvider({
      terminal: fakeTerminal([fakeLine('src/missing.ts')]),
      resolve: vi.fn().mockResolvedValue([{ status: 'missing', reference: { path: 'src/missing.ts' } }]),
      activate: vi.fn(),
    })
    await expect(providedLinks(missing)).resolves.toBeUndefined()
    missing.dispose()

    const failed = new TerminalFileLinkProvider({
      terminal: fakeTerminal([fakeLine('src/failure.ts')]),
      resolve: vi.fn().mockRejectedValue(new Error('offline')),
      activate: vi.fn(),
    })
    await expect(providedLinks(failed)).resolves.toBeUndefined()
    failed.dispose()
  })
})
