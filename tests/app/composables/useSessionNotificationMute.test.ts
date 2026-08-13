// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, toRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MUTED_NOTIFICATION_SESSION_IDS_KEY,
  useSessionNotificationMute,
} from '../../../app/composables/useSessionNotificationMute'
import { PUSH_SUBSCRIPTION_CHANGED_EVENT } from '../../../app/attention/push-subscription-events'

const endpoint = 'https://fcm.googleapis.com/fcm/send/subscription'
const fetchMock = vi.fn()
let activeEndpoint: string | null = endpoint
let registered = true
let serverMutes = new Set<string>()

const Harness = defineComponent({
  props: {
    sessionId: { default: null, type: String },
  },
  setup(props) {
    return useSessionNotificationMute({ sessionId: toRef(props, 'sessionId') })
  },
  template: '<button data-toggle @click="toggle">{{ muted }}</button>',
})

const event = {
  createdAt: '2026-08-07T12:00:00.000Z',
  id: 'evt_123456789012',
  sessionId: 'abcdefghijklmnop',
  source: 'codex',
  title: 'Codex turn completed',
  type: 'completed' as const,
  windowId: '@4',
}

describe('useSessionNotificationMute', () => {
  beforeEach(() => {
    activeEndpoint = endpoint
    registered = true
    serverMutes = new Set()
    window.localStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (_path: string, options: {
      body?: { muted: boolean, sessionId: string }
      method?: string
    }) => {
      if (options.method === 'PUT') {
        const { muted, sessionId } = options.body!
        if (muted) serverMutes.add(sessionId)
        else serverMutes.delete(sessionId)
        return { muted }
      }
      return { sessionIds: [...serverMutes], subscribed: registered }
    })
    vi.stubGlobal('$fetch', fetchMock)
    Object.defineProperty(window, 'PushManager', { configurable: true, value: vi.fn() })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn(async () => activeEndpoint ? { endpoint: activeEndpoint } : null),
          },
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('keeps a session muted across tmux windows, Chrome tab activity and remounts', async () => {
    const wrapper = mount(Harness, { props: { sessionId: 'abcdefghijklmnop' } })
    await flushPromises()

    expect(wrapper.vm.available).toBe(true)
    expect(wrapper.vm.muted).toBe(false)
    await wrapper.get('[data-toggle]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.muted).toBe(true)
    expect(wrapper.vm.suppresses(event)).toBe(true)
    expect(wrapper.vm.suppresses({ ...event, windowId: '@9' })).toBe(true)
    expect(window.localStorage.getItem(MUTED_NOTIFICATION_SESSION_IDS_KEY))
      .toContain('abcdefghijklmnop')
    const callsAfterMute = fetchMock.mock.calls.length
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('blur'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterMute)

    await wrapper.setProps({ sessionId: 'qrstuvwxyzabcdef' })
    expect(wrapper.vm.muted).toBe(false)
    await wrapper.setProps({ sessionId: 'abcdefghijklmnop' })
    expect(wrapper.vm.muted).toBe(true)
    wrapper.unmount()

    const remounted = mount(Harness, { props: { sessionId: 'abcdefghijklmnop' } })
    await flushPromises()
    expect(remounted.vm.muted).toBe(true)
    remounted.unmount()
  })

  it('syncs mute changes from another Chrome tab', async () => {
    const wrapper = mount(Harness, { props: { sessionId: 'abcdefghijklmnop' } })
    await flushPromises()

    window.dispatchEvent(new StorageEvent('storage', {
      key: MUTED_NOTIFICATION_SESSION_IDS_KEY,
      newValue: JSON.stringify(['abcdefghijklmnop']),
    }))

    expect(wrapper.vm.muted).toBe(true)
    expect(wrapper.vm.suppresses(event)).toBe(true)
    wrapper.unmount()
  })

  it('toggles any sidebar session without changing the active session', async () => {
    const wrapper = mount(Harness, { props: { sessionId: 'abcdefghijklmnop' } })
    await flushPromises()

    await wrapper.vm.toggleSession('qrstuvwxyzabcdef')
    await flushPromises()

    expect(wrapper.vm.muted).toBe(false)
    expect(wrapper.vm.isMuted('qrstuvwxyzabcdef')).toBe(true)
    expect(wrapper.vm.isBusy('qrstuvwxyzabcdef')).toBe(false)
    expect(wrapper.vm.hasError('qrstuvwxyzabcdef')).toBe(false)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/attention/push/session-mutes', {
      body: {
        endpoint,
        muted: true,
        sessionId: 'qrstuvwxyzabcdef',
      },
      method: 'PUT',
    })
    wrapper.unmount()
  })

  it('hides the control as soon as device notifications are disabled', async () => {
    const wrapper = mount(Harness, { props: { sessionId: 'abcdefghijklmnop' } })
    await flushPromises()
    expect(wrapper.vm.available).toBe(true)

    activeEndpoint = null
    registered = false
    window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_CHANGED_EVENT))
    await flushPromises()

    expect(wrapper.vm.available).toBe(false)
    expect(wrapper.vm.muted).toBe(false)
    wrapper.unmount()
  })
})
