// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTED_ATTENTION_EVENT_IDS_KEY } from '../../../app/attention/inbox-state'
import { SESSION_NOTIFICATION_MUTES_CHANGED_EVENT } from '../../../app/attention/push-subscription-events'
import { useAttentionInbox } from '../../../app/composables/useAttentionInbox'

const closeTransport = vi.hoisted(() => vi.fn())

vi.mock('~/terminal/browser-websocket-transport', () => ({
  BrowserWebSocketTransportFactory: class {
    create(handlers: { onOpen(): void }) {
      handlers.onOpen()
      return { close: closeTransport, send: vi.fn() }
    }
  },
}))

const event = {
  createdAt: '2026-08-07T12:00:00.000Z',
  id: 'evt_123456789012',
  sessionId: 'abcdefghijklmnop',
  sessionName: 'bitveins',
  source: 'codex',
  title: 'Codex turn completed',
  type: 'completed' as const,
  windowId: '@4',
}

function harness(shouldSuppress: () => boolean) {
  return defineComponent({
    setup() {
      return useAttentionInbox({ shouldSuppress })
    },
    template: '<div />',
  })
}

describe('useAttentionInbox muted events', () => {
  beforeEach(() => {
    window.localStorage.clear()
    closeTransport.mockClear()
    vi.stubGlobal('$fetch', vi.fn(async () => ({ events: [] })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('hides a muted realtime event from the Inbox while retaining it for deep links', async () => {
    const wrapper = mount(harness(() => true))
    await flushPromises()

    window.dispatchEvent(new CustomEvent('bitveins:attention-event', { detail: event }))
    await flushPromises()

    expect(wrapper.vm.events).toEqual([])
    expect(wrapper.vm.lookupEvents).toEqual([event])
    expect(wrapper.vm.unreadCount).toBe(0)
    expect(window.localStorage.getItem(MUTED_ATTENTION_EVENT_IDS_KEY)).toContain(event.id)
    wrapper.unmount()
  })

  it('keeps a previously muted event hidden after a refresh or reload', async () => {
    window.localStorage.setItem(MUTED_ATTENTION_EVENT_IDS_KEY, JSON.stringify([event.id]))
    vi.stubGlobal('$fetch', vi.fn(async () => ({ events: [event] })))
    const wrapper = mount(harness(() => false))
    await flushPromises()

    expect(wrapper.vm.events).toEqual([])
    expect(wrapper.vm.lookupEvents).toEqual([event])
    expect(wrapper.vm.unreadCount).toBe(0)
    wrapper.unmount()
  })

  it('immediately hides an existing event when its session becomes muted', async () => {
    let muted = false
    vi.stubGlobal('$fetch', vi.fn(async () => ({ events: [event] })))
    const wrapper = mount(harness(() => muted))
    await flushPromises()
    expect(wrapper.vm.events).toEqual([event])

    muted = true
    window.dispatchEvent(new Event(SESSION_NOTIFICATION_MUTES_CHANGED_EVENT))

    expect(wrapper.vm.events).toEqual([])
    expect(wrapper.vm.lookupEvents).toEqual([event])
    wrapper.unmount()
  })
})
