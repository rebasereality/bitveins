import { describe, expect, it } from 'vitest'
import {
  createFileBodySchema,
  createSessionBodySchema,
  historyScopeSchema,
  MAX_HISTORY_MESSAGE_CHARS,
  openTransferBodySchema,
  renameWindowBodySchema,
  saveDropzonesBodySchema,
  saveFileBodySchema,
  saveHistoryBodySchema,
} from '../../../shared/contracts/api'

describe('REST API contracts', () => {
  it('accepts valid primary mutation payloads', () => {
    expect(createSessionBodySchema.parse({ name: 'dev', path: '/workspace/dev' })).toEqual({
      name: 'dev',
      path: '/workspace/dev',
    })
    expect(createFileBodySchema.parse({ path: 'src/index.ts' })).toEqual({
      isDir: false,
      path: 'src/index.ts',
    })
    expect(renameWindowBodySchema.parse({ name: 'editor' })).toEqual({ name: 'editor' })
    expect(openTransferBodySchema.parse({
      name: 'Documentation',
      path: '~/code/docs',
    })).toEqual({
      name: 'Documentation',
      path: '~/code/docs',
    })
  })

  it('coerces history indices and validates tmux window ids', () => {
    expect(historyScopeSchema.parse({ windowId: '@12', windowIndex: '3' })).toEqual({
      windowId: '@12',
      windowIndex: 3,
    })
    expect(() => historyScopeSchema.parse({ windowId: '12', windowIndex: 3 })).toThrow()
  })

  it('keeps oversized terminal submissions recoverable without accepting unbounded history', () => {
    const scope = { windowId: '@12', windowIndex: 3 }
    const recoverablePrompt = 'x'.repeat(64 * 1024 + 1)

    expect(saveHistoryBodySchema.parse({
      ...scope,
      message: recoverablePrompt,
    }).message).toHaveLength(recoverablePrompt.length)
    expect(() => saveHistoryBodySchema.parse({
      ...scope,
      message: 'x'.repeat(MAX_HISTORY_MESSAGE_CHARS + 1),
    })).toThrow('History message exceeds the 1-million-character recovery limit.')
  })

  it('rejects control characters and oversized editor payloads', () => {
    expect(() => renameWindowBodySchema.parse({ name: 'bad\nname' })).toThrow()
    expect(() => saveFileBodySchema.parse({
      path: 'large.txt',
      content: 'x'.repeat(5 * 1024 * 1024 + 1),
    })).toThrow('File content exceeds the 5 MiB editor limit.')
  })

  it('caps persisted dropzones', () => {
    const dropzones = Array.from({ length: 101 }, (_, index) => ({
      name: `zone-${index}`,
      path: `/workspace/${index}`,
    }))

    expect(() => saveDropzonesBodySchema.parse({ dropzones })).toThrow()
  })
})
