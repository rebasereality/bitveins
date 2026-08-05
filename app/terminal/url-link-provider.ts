import type {
  IDisposable,
  ILink,
  ILinkProvider,
} from '@xterm/xterm'
import { readLogicalBufferLine } from '~/terminal/file-link-provider'

interface TerminalUrlLinkProviderOptions {
  activate: (url: string) => void
  terminal: Parameters<typeof readLogicalBufferLine>[0]
}

export interface ParsedTerminalUrl {
  endIndex: number
  startIndex: number
  text: string
  url: string
}

const URL_CANDIDATE_PATTERN = /\b(?:https?:\/\/[^\s<>"'`]+|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#][^\s<>"'`]*)?)(?![\w.:])/giu
const MAX_URL_LENGTH = 2_048

function isModifierActive(event: Pick<KeyboardEvent | MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey
}

function characterCount(value: string, character: string): number {
  return [...value].filter(candidate => candidate === character).length
}

function trimUrlCandidate(value: string): string {
  let trimmed = value.replace(/[.,;:!?]+$/u, '')
  const pairs = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ] as const

  let changed = true
  while (changed && trimmed) {
    changed = false
    for (const [opening, closing] of pairs) {
      if (trimmed.endsWith(closing) && characterCount(trimmed, closing) > characterCount(trimmed, opening)) {
        trimmed = trimmed.slice(0, -1)
        changed = true
      }
    }
  }
  return trimmed
}

export function parseTerminalUrls(text: string): ParsedTerminalUrl[] {
  const urls: ParsedTerminalUrl[] = []
  for (const match of text.matchAll(URL_CANDIDATE_PATTERN)) {
    if (match.index === undefined) continue
    const candidate = trimUrlCandidate(match[0])
    if (!candidate || candidate.length > MAX_URL_LENGTH) continue
    try {
      const hasScheme = /^https?:\/\//iu.test(candidate)
      const parsed = new URL(hasScheme ? candidate : `http://${candidate}`)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
      if (!hasScheme && !isIPv4Address(parsed.hostname)) continue
      urls.push({
        endIndex: match.index + candidate.length,
        startIndex: match.index,
        text: candidate,
        url: parsed.href,
      })
    }
    catch {
      // Ignore malformed terminal output.
    }
  }
  return urls
}

function isIPv4Address(hostname: string): boolean {
  const octets = hostname.split('.')
  return octets.length === 4
    && octets.every(octet => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)
}

export class TerminalUrlLinkProvider implements ILinkProvider, IDisposable {
  private disposed = false
  private modifierActive = false
  private readonly hoveredLinks = new Set<ILink>()

  constructor(private readonly options: TerminalUrlLinkProviderOptions) {
    window.addEventListener('keydown', this.onKeyChange, true)
    window.addEventListener('keyup', this.onKeyChange, true)
    window.addEventListener('blur', this.onWindowBlur)
  }

  provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    const line = readLogicalBufferLine(this.options.terminal, bufferLineNumber)
    if (!line) {
      callback(undefined)
      return
    }

    const links = parseTerminalUrls(line.text).flatMap((parsed) => {
      const start = line.positions[parsed.startIndex]
      const end = line.positions[parsed.endIndex - 1]
      if (!start || !end) return []

      const link: ILink = {
        range: { start, end },
        text: parsed.text,
        decorations: {
          pointerCursor: this.modifierActive,
          underline: this.modifierActive,
        },
        activate: (event) => {
          if (isModifierActive(event)) this.options.activate(parsed.url)
        },
        hover: (event) => {
          this.hoveredLinks.add(link)
          this.modifierActive = isModifierActive(event)
          queueMicrotask(() => {
            if (this.hoveredLinks.has(link)) this.updateDecorations()
          })
        },
        leave: () => this.hoveredLinks.delete(link),
        dispose: () => this.hoveredLinks.delete(link),
      }
      return [link]
    })
    callback(links.length > 0 ? links : undefined)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyChange, true)
    window.removeEventListener('keyup', this.onKeyChange, true)
    window.removeEventListener('blur', this.onWindowBlur)
    this.hoveredLinks.clear()
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
      link.decorations.underline = this.modifierActive
    }
  }
}
