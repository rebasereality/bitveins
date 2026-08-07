import { describe, expect, it } from 'vitest'
import type { AttentionEvent } from '../../../shared/contracts/attention'
import {
  mergeAttentionSnapshots,
  parseMutedAttentionEventIds,
  rememberMutedAttentionEvents,
} from '../../../app/attention/inbox-state'

const event = (id: string, overrides: Partial<AttentionEvent> = {}): AttentionEvent => ({
  createdAt: '2026-08-03T12:00:00.000Z',
  id,
  source: 'test',
  title: id,
  type: 'information',
  ...overrides,
})

describe('mergeAttentionSnapshots', () => {
  it('preserves realtime arrivals and monotone read state across stale REST snapshots', () => {
    const readAt = '2026-08-03T12:01:00.000Z'
    const dismissedAt = '2026-08-03T12:02:00.000Z'
    expect(mergeAttentionSnapshots(
      [event('evt_123456789012', { dismissedAt, readAt }), event('evt_ABCDEFGHIJKL')],
      [event('evt_123456789012', {
        dismissedAt: '2026-08-03T11:59:00.000Z',
        readAt: '2026-08-03T11:58:00.000Z',
      })],
    )).toEqual([
      event('evt_123456789012', { dismissedAt, readAt }),
      event('evt_ABCDEFGHIJKL'),
    ])
  })

  it('remembers only valid event ids that arrive while their session is muted', () => {
    const muted = rememberMutedAttentionEvents(
      new Set(['evt_000000000001']),
      [
        event('evt_000000000002', { sessionId: 'abcdefghijklmnop', windowId: '@4' }),
        event('evt_000000000003', { sessionId: 'qrstuvwxyzabcdef', windowId: '@5' }),
      ],
      incoming => incoming.sessionId === 'abcdefghijklmnop',
    )

    expect([...muted]).toEqual(['evt_000000000001', 'evt_000000000002'])
    expect(parseMutedAttentionEventIds(JSON.stringify([...muted, 'invalid']))).toEqual(muted)
    expect(parseMutedAttentionEventIds('{broken')).toEqual(new Set())
  })
})
