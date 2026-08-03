const DARK_ANSI_234_FOREGROUND = '\x1b[38;5;234m'
const DEFAULT_FOREGROUND = '\x1b[39m'

// Hermes uses ANSI 234 for both response text and dark surfaces. Normalize
// only the foreground so response text follows the theme without recoloring
// legitimate `48;5;234` backgrounds.

export interface TerminalOutputNormalizer {
  normalize: (data: string) => string
  reset: () => void
}

export function createTerminalOutputNormalizer(
  enabled: () => boolean,
): TerminalOutputNormalizer {
  let pendingPrefix = ''

  return {
    normalize(data: string): string {
      const combined = pendingPrefix + data
      pendingPrefix = ''

      if (!enabled()) {
        return combined
      }

      for (
        let length = Math.min(DARK_ANSI_234_FOREGROUND.length - 1, combined.length)
        ; length > 0
        ; length -= 1
      ) {
        const suffix = combined.slice(-length)
        if (DARK_ANSI_234_FOREGROUND.startsWith(suffix)) {
          pendingPrefix = suffix
          break
        }
      }

      const completeData = pendingPrefix
        ? combined.slice(0, -pendingPrefix.length)
        : combined

      return completeData.replaceAll(DARK_ANSI_234_FOREGROUND, DEFAULT_FOREGROUND)
    },
    reset(): void {
      pendingPrefix = ''
    },
  }
}
