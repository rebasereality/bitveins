import type { Terminal } from '@xterm/xterm'
import type { ShallowRef } from 'vue'

interface TerminalOutputBufferOptions {
  enabled?: boolean
  onStdout?: () => void
  terminal: ShallowRef<Terminal | null>
}

export function useTerminalOutputBuffer(options: TerminalOutputBufferOptions) {
  let buffering = false
  let output = ''
  let flushTimer: number | null = null
  let maxFlushTimer: number | null = null

  function clearTerminal(): void {
    options.terminal.value?.clear()
    options.terminal.value?.write('\x1b[2J\x1b[3J\x1b[H')
  }

  function clearTimers(): void {
    if (flushTimer) {
      window.clearTimeout(flushTimer)
      flushTimer = null
    }

    if (maxFlushTimer) {
      window.clearTimeout(maxFlushTimer)
      maxFlushTimer = null
    }
  }

  function flush(): void {
    if (!buffering) {
      return
    }

    const data = output
    buffering = false
    output = ''
    clearTimers()

    if (!data) {
      return
    }

    clearTerminal()
    options.onStdout?.()
    options.terminal.value?.write(data)
  }

  return {
    begin(): void {
      if (!options.enabled) {
        return
      }

      clearTimers()
      buffering = true
      output = ''
      maxFlushTimer = window.setTimeout(flush, 450)
    },
    buffer(data: string): boolean {
      if (!buffering) {
        return false
      }

      output += data

      if (output.length > 1024 * 1024) {
        output = output.slice(-512 * 1024)
      }

      if (flushTimer) {
        window.clearTimeout(flushTimer)
      }

      flushTimer = window.setTimeout(flush, 80)
      return true
    },
    clearTerminal,
    dispose(): void {
      buffering = false
      output = ''
      clearTimers()
    },
    flush,
  }
}
