// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import AsyncTerminalHeader from '../../../app/components/AsyncTerminalHeader.vue'

const UButtonStub = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    icon: String,
    title: String,
  },
  emits: ['click'],
  template: '<button v-bind="$attrs" :disabled="disabled" :title="title" :data-icon="icon" @click="$emit(\'click\')"></button>',
})

function mountHeader(overrides: Record<string, unknown> = {}) {
  return mount(AsyncTerminalHeader, {
    props: {
      activeWindowValue: '4',
      editingWindowIndex: null,
      hasPathLinkRoots: false,
      notificationMuteAvailable: true,
      notificationMuteBusy: false,
      notificationMuteError: false,
      notificationMuted: false,
      pathLinkRoot: null,
      windows: [],
      windowTabItems: [],
      ...overrides,
    },
    global: {
      components: {
        UButton: UButtonStub,
      },
      stubs: {
        PathLinkRootMenu: true,
        TmuxWindowTabStrip: true,
      },
    },
  })
}

describe('AsyncTerminalHeader fullscreen', () => {
  it('places a fullscreen toggle after the split pane buttons', async () => {
    const wrapper = mountHeader()
    const labels = wrapper.findAll('button').map(button => button.attributes('aria-label'))
    const splitVertical = labels.indexOf('Split Vertical')
    const fullscreen = labels.indexOf('Enter fullscreen')
    const button = wrapper.get('[data-fullscreen-toggle]')

    expect(fullscreen).toBe(splitVertical + 1)
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('data-icon')).toBe('i-lucide-maximize')
    expect(button.attributes('title')).toBe('Enter fullscreen')
  })

  it('shows the pressed exit state while fullscreen', () => {
    const wrapper = mountHeader({ fullscreen: true })
    const button = wrapper.get('[data-fullscreen-toggle]')

    expect(button.attributes('aria-label')).toBe('Exit fullscreen')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('data-icon')).toBe('i-lucide-minimize')
  })
})

describe('AsyncTerminalHeader notification mute', () => {
  it('shows an enabled bell by default', () => {
    const wrapper = mountHeader()
    const button = wrapper.get('[aria-label="Mute notifications for this session"]')

    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('data-icon')).toBe('i-lucide-bell')
  })

  it('shows the muted state and hides the control without a push subscription', () => {
    const muted = mountHeader({ notificationMuted: true })
    expect(muted.get('[aria-label="Unmute notifications for this session"]').attributes('data-icon'))
      .toBe('i-lucide-bell-off')

    const unavailable = mountHeader({ notificationMuteAvailable: false })
    expect(unavailable.find('[aria-label="Mute notifications for this session"]').exists()).toBe(false)
  })
})
