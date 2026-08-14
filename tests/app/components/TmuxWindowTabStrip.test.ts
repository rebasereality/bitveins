// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TmuxWindowTabStrip from '../../../app/components/TmuxWindowTabStrip.vue'

const IconStub = defineComponent({
  name: 'UIcon',
  props: { name: String },
  template: '<span :data-icon="name" />',
})

const items = [
  { label: 'shell', name: 'shell', title: '/workspace', value: '0', windowIndex: 0 },
  { label: 'tests', name: 'tests', title: '/workspace', value: '1', windowIndex: 1 },
]

function mountStrip(overrides: Record<string, unknown> = {}) {
  return mount(TmuxWindowTabStrip, {
    props: {
      activeValue: '0',
      editingWindowIndex: null,
      items,
      windowCount: 2,
      ...overrides,
    },
    global: {
      components: { UIcon: IconStub },
    },
  })
}

describe('TmuxWindowTabStrip', () => {
  it('renders semantic compact tabs using names only and emits select, close and create', async () => {
    const close = vi.fn()
    const create = vi.fn()
    const select = vi.fn()
    const wrapper = mountStrip({
      onClose: close,
      onCreate: create,
      onSelect: select,
    })
    const tabs = wrapper.findAll('[role="tab"]')

    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    expect(tabs.map(tab => tab.text())).toEqual(['shell', 'tests'])
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
    expect(wrapper.text()).not.toContain('0:shell')

    await tabs[1]!.trigger('click')
    await wrapper.find('button[aria-label="Close tmux window 1: tests"]').trigger('click')
    await wrapper.find('button[aria-label="New tmux window"]').trigger('click')

    expect(select).toHaveBeenCalledWith('1')
    expect(close).toHaveBeenCalledWith(1)
    expect(create).toHaveBeenCalledOnce()
  })

  it('guards the last window and supports inline rename by double click', async () => {
    const single = mountStrip({
      activeValue: '0',
      items: items.slice(0, 1),
      windowCount: 1,
    })
    expect(single.find('[aria-label^="Close tmux window"]').exists()).toBe(false)

    const commitRename = vi.fn()
    const startRename = vi.fn()
    const updateName = vi.fn()
    const wrapper = mountStrip({
      'onCommitRename': commitRename,
      'onStartRename': startRename,
      'onUpdate:editingWindowName': updateName,
    })
    await wrapper.findAll('[role="tab"]')[1]!.trigger('dblclick')
    expect(startRename).toHaveBeenCalledWith(1)

    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const selectText = vi.spyOn(HTMLInputElement.prototype, 'select')
    await wrapper.setProps({ editingWindowIndex: 1, editingWindowName: 'tests' })
    await nextTick()
    const input = wrapper.find('input[aria-label="Rename tmux window 1"]')
    expect(focus).toHaveBeenCalledOnce()
    expect(selectText).toHaveBeenCalledOnce()
    await input.setValue('checks')
    await input.trigger('keydown', { key: 'Enter' })
    expect(updateName).toHaveBeenLastCalledWith('checks')
    expect(commitRename).toHaveBeenCalledOnce()
    focus.mockRestore()
    selectText.mockRestore()
  })

  it('renders colored agent status indicator square before the tab label when agent status is present', () => {
    const itemsWithStatus = [
      { agentStatus: 'working' as const, label: 'agent-1', name: 'agent-1', title: '/workspace', value: '0', windowIndex: 0 },
      { agentStatus: 'blocked' as const, label: 'agent-2', name: 'agent-2', title: '/workspace', value: '1', windowIndex: 1 },
      { label: 'shell', name: 'shell', title: '/workspace', value: '2', windowIndex: 2 },
    ]
    const wrapper = mountStrip({
      items: itemsWithStatus,
      windowCount: 3,
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(3)

    const indicator0 = tabs[0]!.find('[data-agent-status]')
    expect(indicator0.exists()).toBe(true)
    expect(indicator0.attributes('data-status')).toBe('working')
    expect(indicator0.classes()).toContain('tmux-agent-state--working')

    const indicator1 = tabs[1]!.find('[data-agent-status]')
    expect(indicator1.exists()).toBe(true)
    expect(indicator1.attributes('data-status')).toBe('blocked')
    expect(indicator1.classes()).toContain('tmux-agent-state--blocked')

    const indicator2 = tabs[2]!.find('[data-agent-status]')
    expect(indicator2.exists()).toBe(false)
  })
})
