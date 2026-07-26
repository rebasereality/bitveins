// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SessionWelcome from '../../../app/components/SessionWelcome.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  props: {
    label: {
      type: String,
      default: '',
    },
  },
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')">{{ label }}</button>',
})

const IconStub = defineComponent({
  name: 'UIcon',
  template: '<span />',
})

const global = {
  components: {
    UButton: ButtonStub,
    UIcon: IconStub,
  },
}

describe('SessionWelcome', () => {
  it('offers up to six existing sessions and emits attach and create actions', async () => {
    const attach = vi.fn()
    const create = vi.fn()
    const sessions = Array.from({ length: 8 }, (_, index) => ({
      name: `workspace-${index + 1}`,
      path: `/home/theman/code/workspace-${index + 1}`,
    }))
    const wrapper = mount(SessionWelcome, {
      props: {
        loading: false,
        sessions,
        onAttach: attach,
        onCreate: create,
      },
      global,
    })

    expect(wrapper.findAll('[data-session-welcome-card]')).toHaveLength(6)
    expect(wrapper.text()).toContain('2 more in the sidebar')
    expect(wrapper.text()).toContain('~/code/workspace-1')

    await wrapper.get('[aria-label="Open session workspace-1"]').trigger('click')
    expect(attach).toHaveBeenCalledWith('workspace-1')

    await wrapper.getComponent(ButtonStub).trigger('click')
    expect(create).toHaveBeenCalledOnce()
  })

  it('shows a focused first-session action only after loading completes', async () => {
    const create = vi.fn()
    const wrapper = mount(SessionWelcome, {
      props: {
        loading: true,
        sessions: [],
        onCreate: create,
      },
      global,
    })

    expect(wrapper.text()).toContain('Loading your sessions')
    expect(wrapper.text()).not.toContain('Create your first session')

    await wrapper.setProps({ loading: false })
    expect(wrapper.text()).toContain('Start your first workspace')
    await wrapper.getComponent(ButtonStub).trigger('click')
    expect(create).toHaveBeenCalledOnce()
  })
})
