import { describe, expect, it } from 'vitest'
import {
  liveControlOrderStorageKey,
  readLiveControlOrder,
  reconcileLiveControlOrder,
  saveLiveControlOrder,
  shouldBlockLiveControlActivation,
  shouldBlockLiveControlSend,
} from '../../../app/utils/live-control-order'

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

describe('live control order storage', () => {
  const defaults = ['escape', 'tab', 'page-up', 'enter']

  it('keeps known saved ids once, drops unknown ids, and appends new defaults', () => {
    expect(reconcileLiveControlOrder(['enter', 'missing', 'escape', 'enter'], defaults)).toEqual([
      'enter',
      'escape',
      'tab',
      'page-up',
    ])
  })

  it('reconciles old saved send-only orders by preserving them and appending modifiers', () => {
    const oldSavedOrder = ['enter', 'escape', 'tab', 'page-up']
    const currentDefaults = [
      'modifier-ctrl',
      'modifier-shift',
      'modifier-alt',
      'escape',
      'tab',
      'page-up',
      'enter',
    ]

    expect(reconcileLiveControlOrder(oldSavedOrder, currentDefaults)).toEqual([
      'enter',
      'escape',
      'tab',
      'page-up',
      'modifier-ctrl',
      'modifier-shift',
      'modifier-alt',
    ])
  })

  it('falls back to defaults for invalid JSON and non-array JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(liveControlOrderStorageKey, '{nope')

    expect(readLiveControlOrder(storage, defaults)).toEqual(defaults)

    storage.setItem(liveControlOrderStorageKey, JSON.stringify({ escape: 1 }))

    expect(readLiveControlOrder(storage, defaults)).toEqual(defaults)
  })

  it('persists order only under the local live controls key', () => {
    const storage = new MemoryStorage()

    saveLiveControlOrder(storage, ['enter', 'escape'])

    expect(storage.getItem(liveControlOrderStorageKey)).toBe(JSON.stringify(['enter', 'escape']))
    expect(storage.length).toBe(1)
  })

  it('blocks send actions and modifier toggles while dragging and briefly after drag end', () => {
    const dragging = { dragging: true, lastDragEndedAt: 0, now: 1000 }
    const justReleased = { dragging: false, lastDragEndedAt: 1000, now: 1200 }
    const settled = { dragging: false, lastDragEndedAt: 1000, now: 1400 }

    expect(shouldBlockLiveControlActivation(dragging)).toBe(true)
    expect(shouldBlockLiveControlActivation(justReleased)).toBe(true)
    expect(shouldBlockLiveControlActivation(settled)).toBe(false)
    expect(shouldBlockLiveControlSend(justReleased)).toBe(true)
  })
})
