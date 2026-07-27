// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionSidebarSessionState from '../../../app/components/SessionSidebarSessionState.vue'

describe('SessionSidebarSessionState', () => {
  it('renders compact session-shaped skeletons while loading', () => {
    const wrapper = mount(SessionSidebarSessionState, {
      props: { loading: true },
    })

    const loading = wrapper.get('[data-session-loading]')
    const rows = loading.findAll(':scope > div')

    expect(loading.attributes('aria-label')).toBe('Loading tmux sessions')
    expect(rows).toHaveLength(3)
    expect(rows.every(row => row.classes().includes('h-6'))).toBe(true)
    expect(wrapper.find('[data-session-empty]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('No sessions')
  })

  it('renders a single compact empty row only after loading completes', async () => {
    const wrapper = mount(SessionSidebarSessionState, {
      props: { loading: true },
    })

    await wrapper.setProps({ loading: false })

    expect(wrapper.find('[data-session-loading]').exists()).toBe(false)
    expect(wrapper.get('[data-session-empty]').classes()).toContain('h-6')
    expect(wrapper.text()).toContain('No sessions yet')
  })

  it('uses touch-sized rows in the mobile drawer', () => {
    const wrapper = mount(SessionSidebarSessionState, {
      props: {
        isMobile: true,
        loading: true,
      },
    })

    expect(
      wrapper.get('[data-session-loading]').findAll(':scope > div')
        .every(row => row.classes().includes('h-9')),
    ).toBe(true)
  })
})
