import { describe, expect, it } from 'vitest'
import {
  isTerminalInputWithinLimit,
  parseClientMessage,
  parseServerMessage,
  parseTerminalSize,
  terminalInputByteLength,
} from '../../../shared/contracts/terminal'

describe('ws protocol', () => {
  it('parses attach and appearance messages for terminal theme hints', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'attach',
      payload: { sessionName: 'main', appearance: 'light' },
    }))).toEqual({
      action: 'attach',
      payload: { sessionName: 'main', appearance: 'light' },
    })
    expect(parseClientMessage(JSON.stringify({
      action: 'setAppearance',
      payload: { appearance: 'dark' },
    }))).toEqual({
      action: 'setAppearance',
      payload: { appearance: 'dark' },
    })
  })

  it('parses attach messages with optional terminal size', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'attach',
      payload: {
        sessionName: 'main',
        cols: 120,
        rows: 40,
      },
    }))).toEqual({
      action: 'attach',
      payload: {
        sessionName: 'main',
        cols: 120,
        rows: 40,
      },
    })
  })

  it('parses per-window attach messages', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'attachWindow',
      payload: {
        sessionName: 'main',
        windowIndex: 1,
        cols: 120,
        rows: 40,
      },
    }))).toEqual({
      action: 'attachWindow',
      payload: {
        sessionName: 'main',
        windowIndex: 1,
        cols: 120,
        rows: 40,
      },
    })
  })

  it('parses pane attachments and rejects unstable pane indexes', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'attachPane',
      payload: { paneId: '%12', sessionName: 'main', windowIndex: 1 },
    }))).toEqual({
      action: 'attachPane',
      payload: { paneId: '%12', sessionName: 'main', windowIndex: 1 },
    })
    expect(() => parseClientMessage(JSON.stringify({
      action: 'attachPane',
      payload: { paneId: '1', sessionName: 'main', windowIndex: 1 },
    }))).toThrow('Attach pane requires a valid paneId.')
  })

  it('parses terminal wheel input messages without client-controlled targets', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M' },
    }))).toEqual({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M' },
    })
  })

  it('accepts only a single-line touch wheel override', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M', lineCount: 1 },
    }))).toEqual({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M', lineCount: 1 },
    })

    expect(() => parseClientMessage(JSON.stringify({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M', lineCount: 2 },
    }))).toThrow()
  })

  it('parses native tmux pane scroll requests', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'scrollPane',
      payload: { direction: 'up', lineCount: 1 },
    }))).toEqual({
      action: 'scrollPane',
      payload: { direction: 'up', lineCount: 1 },
    })
    expect(() => parseClientMessage(JSON.stringify({
      action: 'scrollPane',
      payload: { direction: 'up', lineCount: 2 },
    }))).toThrow()
  })

  it('parses strict binary terminal wheel reports', () => {
    const report = `\u001B[M${String.fromCharCode(96, 52, 40)}`

    expect(parseClientMessage(JSON.stringify({
      action: 'wheelInput',
      payload: { data: report, encoding: 'binary' },
    }))).toEqual({
      action: 'wheelInput',
      payload: { data: report, encoding: 'binary' },
    })
  })

  it('rejects non-wheel binary terminal reports', () => {
    const keyboardReport = `\u001B[M${String.fromCharCode(32, 52, 40)}`

    expect(() => parseClientMessage(JSON.stringify({
      action: 'wheelInput',
      payload: { data: keyboardReport, encoding: 'binary' },
    }))).toThrow('Wheel input requires a legacy binary wheel report.')
  })

  it('rejects non-wheel data in terminal wheel messages', () => {
    expect(() => parseClientMessage(JSON.stringify({
      action: 'wheelInput',
      payload: { data: 'keyboard' },
    }))).toThrow('Wheel input requires an SGR wheel report.')
  })

  it('rejects malformed input payloads', () => {
    expect(() => parseClientMessage(JSON.stringify({
      action: 'input',
      payload: {
        data: 123,
      },
    }))).toThrow('Input requires a data string.')
  })

  it('rejects oversized input payloads', () => {
    expect(() => parseClientMessage(JSON.stringify({
      action: 'input',
      payload: {
        data: 'x'.repeat(64 * 1024 + 1),
      },
    }))).toThrow('Input payload exceeds 65536 bytes.')
  })

  it('measures the UTF-8 byte limit used by both browser and server', () => {
    const multibyteInput = 'é'.repeat(32 * 1024)

    expect(terminalInputByteLength(multibyteInput)).toBe(64 * 1024)
    expect(isTerminalInputWithinLimit(multibyteInput)).toBe(true)
    expect(isTerminalInputWithinLimit(`${multibyteInput}é`)).toBe(false)
  })

  it('parses reliable async input payloads', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'reliableInput',
      payload: {
        id: '019f4f82-f7e5-7000-8000-000000000001',
        data: 'prompt\r',
      },
    }))).toEqual({
      action: 'reliableInput',
      payload: {
        id: '019f4f82-f7e5-7000-8000-000000000001',
        data: 'prompt\r',
      },
    })
  })

  it('rejects reliable input without a UUID', () => {
    expect(() => parseClientMessage(JSON.stringify({
      action: 'reliableInput',
      payload: {
        id: 'not-an-id',
        data: 'prompt\r',
      },
    }))).toThrow('Reliable input requires a UUID id.')
  })

  it('parses tmux window selection messages', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'selectWindow',
      payload: {
        sessionName: 'main',
        index: 2,
      },
    }))).toEqual({
      action: 'selectWindow',
      payload: {
        sessionName: 'main',
        index: 2,
      },
    })
  })

  it('parses tmux window creation messages', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'newWindow',
      payload: {
        sessionName: 'main',
      },
    }))).toEqual({
      action: 'newWindow',
      payload: {
        sessionName: 'main',
      },
    })
  })

  it('parses tmux window kill messages', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'killWindow',
      payload: {
        sessionName: 'main',
        index: 2,
      },
    }))).toEqual({
      action: 'killWindow',
      payload: {
        sessionName: 'main',
        index: 2,
      },
    })
  })

  it('rejects unknown actions', () => {
    expect(() => parseClientMessage(JSON.stringify({
      action: 'explode',
      payload: {},
    }))).toThrow('Unsupported WebSocket action')
  })

  it('clamps terminal sizes to supported bounds', () => {
    expect(parseTerminalSize(2, 999)).toEqual({
      cols: 20,
      rows: 120,
    })
  })

  it('validates server messages before the browser consumes them', () => {
    expect(parseServerMessage(JSON.stringify({
      type: 'attached',
      data: 'Connected',
      sessionName: 'main',
      windowIndex: 2,
    }))).toEqual({
      type: 'attached',
      data: 'Connected',
      sessionName: 'main',
      windowIndex: 2,
    })

    expect(() => parseServerMessage(JSON.stringify({
      type: 'inputAck',
      data: '',
    }))).toThrow()
  })
})
