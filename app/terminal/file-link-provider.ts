import type {
  IBufferCellPosition,
  IDisposable,
  ILink,
  ILinkProvider,
  Terminal,
} from '@xterm/xterm'
import type {
  TerminalFileReference,
  TerminalFileResolution,
} from '#shared/contracts/explorer'
import {
  parseFileReferences,
  type ParsedFileReference,
} from '~/utils/file-reference-parser'

interface LogicalBufferLine {
  positions: IBufferCellPosition[]
  text: string
}

interface TerminalBufferReader {
  buffer: {
    active: {
      getLine(index: number): ReturnType<Terminal['buffer']['active']['getLine']>
    }
  }
}

interface FileLinkProviderOptions {
  activate: (resolution: Exclude<TerminalFileResolution, { status: 'missing' }>) => void
  cacheScope?: () => string
  resolve: (references: TerminalFileReference[]) => Promise<TerminalFileResolution[]>
  terminal: TerminalBufferReader
}

const CACHE_TTL_MS = 2_000
const MAX_CACHE_ENTRIES = 128

function isModifierActive(event: Pick<KeyboardEvent | MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey
}

export function readLogicalBufferLine(
  terminal: TerminalBufferReader,
  bufferLineNumber: number,
): LogicalBufferLine | null {
  const buffer = terminal.buffer.active
  let firstRow = bufferLineNumber - 1
  if (!buffer.getLine(firstRow)) return null

  while (firstRow > 0 && buffer.getLine(firstRow)?.isWrapped) {
    firstRow -= 1
  }

  let lastRow = firstRow
  while (buffer.getLine(lastRow + 1)?.isWrapped) {
    lastRow += 1
  }

  let text = ''
  const positions: IBufferCellPosition[] = []

  for (let row = firstRow; row <= lastRow; row += 1) {
    const line = buffer.getLine(row)
    if (!line) continue
    const isFinalRow = row === lastRow
    const visibleLength = isFinalRow
      ? line.translateToString(true).length
      : line.length
    let produced = 0

    for (let column = 0; column < line.length && produced < visibleLength; column += 1) {
      const cell = line.getCell(column)
      if (!cell || cell.getWidth() === 0) continue
      const chars = cell.getChars() || ' '
      for (let offset = 0; offset < chars.length && produced < visibleLength; offset += 1) {
        text += chars[offset]
        positions.push({ x: column + 1, y: row + 1 })
        produced += 1
      }
    }
  }

  return { text, positions }
}

function linkRange(
  line: LogicalBufferLine,
  reference: ParsedFileReference,
): ILink['range'] | null {
  const start = line.positions[reference.startIndex]
  const end = line.positions[reference.endIndex - 1]
  return start && end ? { start, end } : null
}

export class TerminalFileLinkProvider implements ILinkProvider, IDisposable {
  private readonly cache = new Map<string, {
    expiresAt: number
    resolutions: Promise<TerminalFileResolution[]>
  }>()

  private disposed = false
  private modifierActive = false
  private readonly hoveredLinks = new Set<ILink>()
  private readonly underlinedLinks = new WeakSet<ILink>()

  constructor(private readonly options: FileLinkProviderOptions) {
    window.addEventListener('keydown', this.onKeyChange, true)
    window.addEventListener('keyup', this.onKeyChange, true)
    window.addEventListener('blur', this.onWindowBlur)
  }

  provideLinks(
    bufferLineNumber: number,
    callback: (links: ILink[] | undefined) => void,
  ): void {
    const line = readLogicalBufferLine(this.options.terminal, bufferLineNumber)
    if (!line) {
      callback(undefined)
      return
    }

    const parsed = parseFileReferences(line.text)
    if (parsed.length === 0) {
      callback(undefined)
      return
    }

    const references = parsed.map(({ path, line, column }) => ({
      path,
      ...(line ? { line } : {}),
      ...(column ? { column } : {}),
    }))
    void this.resolveCached(references).then((resolutions) => {
      if (this.disposed) {
        callback(undefined)
        return
      }

      const links = resolutions.flatMap((resolution, index) => {
        if (resolution.status === 'missing') return []
        const reference = parsed[index]
        if (!reference) return []
        const range = linkRange(line, reference)
        if (!range) return []

        const link: ILink = {
          range,
          text: reference.text,
          decorations: {
            pointerCursor: this.modifierActive,
            underline: this.modifierActive && resolution.status === 'unique',
          },
          activate: (event) => {
            if (isModifierActive(event)) this.options.activate(resolution)
          },
          hover: (event) => {
            this.hoveredLinks.add(link)
            this.modifierActive = isModifierActive(event)
            queueMicrotask(() => {
              if (this.hoveredLinks.has(link)) this.updateDecorations()
            })
          },
          leave: () => {
            this.hoveredLinks.delete(link)
          },
          dispose: () => {
            this.hoveredLinks.delete(link)
          },
        }
        if (resolution.status === 'unique') this.underlinedLinks.add(link)
        return [link]
      })
      callback(links.length > 0 ? links : undefined)
    }).catch(() => callback(undefined))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyChange, true)
    window.removeEventListener('keyup', this.onKeyChange, true)
    window.removeEventListener('blur', this.onWindowBlur)
    this.hoveredLinks.clear()
    this.cache.clear()
  }

  private readonly onKeyChange = (event: KeyboardEvent): void => {
    this.modifierActive = isModifierActive(event)
    this.updateDecorations()
  }

  private readonly onWindowBlur = (): void => {
    this.modifierActive = false
    this.updateDecorations()
  }

  private updateDecorations(): void {
    for (const link of this.hoveredLinks) {
      if (!link.decorations) continue
      link.decorations.pointerCursor = this.modifierActive
      link.decorations.underline = this.modifierActive && this.underlinedLinks.has(link)
    }
  }

  private resolveCached(
    references: TerminalFileReference[],
  ): Promise<TerminalFileResolution[]> {
    const key = `${this.options.cacheScope?.() || ''}:${JSON.stringify(references)}`
    const now = Date.now()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > now) return cached.resolutions

    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear()
    const resolutions = this.options.resolve(references)
    this.cache.set(key, { expiresAt: now + CACHE_TTL_MS, resolutions })
    void resolutions.catch(() => this.cache.delete(key))
    return resolutions
  }
}
