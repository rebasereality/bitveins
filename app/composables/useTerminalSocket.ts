import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'
import type { Ref, ShallowRef } from 'vue'
import { BrowserWebSocketTransportFactory } from '~/terminal/browser-websocket-transport'
import { BrowserConnectionEnvironment } from '~/terminal/connection-environment'
import { BrowserScheduler } from '~/terminal/scheduler'
import { TerminalConnectionController } from '~/terminal/terminal-connection-controller'
import type { InputMode, TerminalConnectionState } from '~/types/session'
import { saveSubmittedAsyncPrompt } from '~/utils/async-prompt-recovery'
import { recoverAsyncTerminalPrompt } from '~/utils/async-terminal-submission'

type TerminalSocketOptions = {
  activeSession: Readonly<Ref<string | null>>
  active?: Readonly<Ref<boolean>>
  inputActive?: Readonly<Ref<boolean>>
  bufferInitialOutput?: boolean
  emitAuthExpired: () => void
  fitAddon: ShallowRef<FitAddon | null>
  inputMode: Readonly<Ref<InputMode>>
  normalizeOutput?: (data: string) => string
  onStdout?: () => void
  promptRecoveryKey: string
  resetOutput?: () => void
  resolveAttachmentSize?: (size: { cols: number, rows: number }) => { cols: number, rows: number }
  terminal: ShallowRef<Terminal | null>
}

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws`
}

function isMobileViewport(): boolean {
  return import.meta.client && window.matchMedia('(max-width: 1023px)').matches
}

export function useTerminalSocket(options: TerminalSocketOptions) {
  const status = ref('Detached')
  const connectionState = ref<TerminalConnectionState>('detached')
  let attached = false
  let currentWindowAttachment: {
    acceptLegacy?: boolean
    paneId?: string
    sessionName: string
    windowIndex: number
  } | null = null
  let reliableInput: ReturnType<typeof useReliableTerminalInput> | null = null
  const outputBuffer = useTerminalOutputBuffer({
    enabled: options.bufferInitialOutput,
    onStdout: options.onStdout,
    terminal: options.terminal,
  })

  function applyInputMode(): void {
    const terminal = options.terminal.value
    if (!terminal) return

    const liveEnabled = (options.inputActive?.value ?? options.active?.value ?? true)
      && attached
      && options.inputMode.value === 'live'
      && Boolean(options.activeSession.value)
    terminal.options.disableStdin = !liveEnabled
    terminal.options.cursorBlink = liveEnabled
    if (liveEnabled && !isMobileViewport()) {
      terminal.focus()
    }
    else {
      terminal.blur()
    }
  }

  function terminalSize(): { cols?: number, rows?: number } {
    if (options.active?.value ?? true) {
      fitTerminal()
    }
    const cols = options.terminal.value?.cols
    const rows = options.terminal.value?.rows
    return cols && rows && options.resolveAttachmentSize
      ? options.resolveAttachmentSize({ cols, rows })
      : { cols, rows }
  }

  function fitTerminal(): void {
    options.fitAddon.value?.fit()
  }

  const controller = new TerminalConnectionController({
    environment: new BrowserConnectionEnvironment(),
    getSize: terminalSize,
    onAttachmentBegin() {
      options.resetOutput?.()
      terminalSize()
      outputBuffer.begin()
    },
    onAttachmentReady() {
      fitAndResize()
    },
    onCheckAuthentication() {
      void checkAuthentication()
    },
    onInputAcknowledged(inputId) {
      reliableInput?.acknowledge(inputId)
    },
    onOutput(data) {
      const normalizedData = options.normalizeOutput?.(data) ?? data
      if (outputBuffer.buffer(normalizedData)) return
      options.onStdout?.()
      options.terminal.value?.write(normalizedData)
    },
    onReliableInputFlush() {
      reliableInput?.flush()
    },
    onReliableInputReset() {
      reliableInput?.resetConnection()
    },
    onStateChange(phase, label) {
      attached = phase === 'attached'
      connectionState.value = phase
      status.value = label
      applyInputMode()
    },
    onStatus(message, error) {
      status.value = message
      if (error) {
        options.terminal.value?.writeln(`\r\n\x1b[31m${message}\x1b[0m`)
      }
    },
    scheduler: new BrowserScheduler(),
    transportFactory: new BrowserWebSocketTransportFactory(wsUrl),
  })

  reliableInput = useReliableTerminalInput({
    attachment: () => currentWindowAttachment,
    onAbandon(data) {
      const prompt = recoverAsyncTerminalPrompt(data)
      if (prompt && import.meta.client) {
        saveSubmittedAsyncPrompt(localStorage, options.promptRecoveryKey, prompt)
      }
    },
    onStatus(label) {
      status.value = label
      options.terminal.value?.writeln(`\r\n\x1b[33m${label}\x1b[0m`)
    },
    onTimeout() {
      controller.reportConnectionFailure()
    },
    post: message => controller.sendMessage(message),
  })
  const pendingReliableCount = reliableInput.pendingCount

  async function checkAuthentication(): Promise<void> {
    try {
      const session = await $fetch<{ authenticated: boolean }>('/api/auth/session')
      if (!session.authenticated) {
        controller.authExpired()
        options.emitAuthExpired()
      }
    }
    catch {
      // A transient auth probe failure should not replace reconnect handling.
    }
  }

  function attach(sessionName: string): void {
    currentWindowAttachment = null
    reliableInput?.refresh()
    controller.attach(sessionName)
  }

  function attachWindow(sessionName: string, windowIndex: number): void {
    currentWindowAttachment = { sessionName, windowIndex }
    reliableInput?.refresh()
    controller.attachWindow(sessionName, windowIndex)
  }

  function attachPane(
    sessionName: string,
    windowIndex: number,
    paneId: string,
    acceptLegacy = false,
  ): void {
    preparePaneAttachment(sessionName, windowIndex, paneId, acceptLegacy)
    controller.attachPane(sessionName, windowIndex, paneId)
  }

  function preparePaneAttachment(
    sessionName: string,
    windowIndex: number,
    paneId: string,
    acceptLegacy = false,
  ): void {
    currentWindowAttachment = { acceptLegacy, paneId, sessionName, windowIndex }
    reliableInput?.refresh()
  }

  function fitAndResize(): void {
    if (!(options.active?.value ?? true)) return
    const terminal = options.terminal.value
    const fitAddon = options.fitAddon.value
    if (!terminal || !fitAddon) return
    fitTerminal()
    const size = options.resolveAttachmentSize
      ? options.resolveAttachmentSize({ cols: terminal.cols, rows: terminal.rows })
      : { cols: terminal.cols, rows: terminal.rows }
    controller.resize(size.cols, size.rows)
  }

  function detach(): void {
    currentWindowAttachment = null
    options.resetOutput?.()
    controller.detach()
    outputBuffer.dispose()
    outputBuffer.clearTerminal()
    pendingReliableCount.value = 0
  }

  function sendInput(data: string): boolean {
    outputBuffer.flush()
    return controller.sendInput(data)
  }

  function sendReliableInput(data: string): boolean {
    return sendReliableInputs([data])
  }

  function sendReliableInputs(data: readonly string[]): boolean {
    outputBuffer.flush()
    const accepted = reliableInput?.enqueueAll(data) ?? false
    if (accepted && controller.isAttached) {
      reliableInput?.flush()
    }
    return accepted
  }

  function dispose(): void {
    currentWindowAttachment = null
    options.resetOutput?.()
    controller.dispose()
    outputBuffer.dispose()
  }

  return {
    applyInputMode,
    attach,
    attachPane,
    attachWindow,
    connectionState,
    detach,
    dispose,
    fitAndResize,
    killWindow: (sessionName: string, index: number) => controller.killWindow(sessionName, index),
    newWindow: (sessionName: string) => controller.newWindow(sessionName),
    pendingReliableCount,
    preparePaneAttachment,
    selectWindow: (sessionName: string, index: number) => controller.selectWindow(sessionName, index),
    sendInput,
    sendReliableInput,
    sendReliableInputs,
    sendScroll: (direction: 'down' | 'up', lineCount?: 1) => (
      controller.sendScroll(direction, lineCount)
    ),
    sendWheelInput: (data: string, encoding: 'binary' | 'utf8', lineCount?: 1) => (
      controller.sendWheelInput(data, encoding, lineCount)
    ),
    status,
  }
}
