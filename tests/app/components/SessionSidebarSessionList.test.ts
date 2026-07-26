// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SessionSidebarSessionList from '../../../app/components/SessionSidebarSessionList.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

const DropdownStub = defineComponent({
  name: 'UDropdownMenu',
  template: '<div><slot /></div>',
})

describe('SessionSidebarSessionList', () => {
  it('marks the active session without changing the row geometry and attaches sessions', async () => {
    const attach = vi.fn()
    const wrapper = mount(SessionSidebarSessionList, {
      props: {
        activeSession: 'Kouizine',
        sessions: [
          { attached: false, name: 'Dropentory', windows: 2 },
          { attached: true, name: 'Kouizine', windows: 1 },
        ],
        onAttach: attach,
      },
      global: {
        components: {
          UButton: ButtonStub,
          UDropdownMenu: DropdownStub,
        },
      },
    })

    const rows = wrapper.findAll('[data-session-active]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.classes()).toContain('h-6')
    expect(rows[1]!.attributes('data-session-active')).toBe('true')
    expect(rows[1]!.find('button[aria-current="true"]').exists()).toBe(true)
    expect(rows[1]!.find('.bg-\\[var\\(--bitveins-shell-accent\\)\\]').exists()).toBe(true)

    await rows[0]!.find('button').trigger('click')
    expect(attach).toHaveBeenCalledWith('Dropentory')
  })
})
