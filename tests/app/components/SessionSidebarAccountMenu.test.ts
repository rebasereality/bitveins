// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SessionSidebarAccountMenu from '../../../app/components/SessionSidebarAccountMenu.vue'

const IconStub = defineComponent({
  name: 'UIcon',
  props: { name: String },
  template: '<span :data-icon="name" />',
})

describe('SessionSidebarAccountMenu', () => {
  it('shows the Linux user and opens settings', async () => {
    const settings = vi.fn()
    const wrapper = mount(SessionSidebarAccountMenu, {
      props: {
        username: 'theman',
        onSettings: settings,
      },
      global: { components: { UIcon: IconStub } },
    })

    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.text()).toContain('theman')
    expect(wrapper.text()).toContain('Linux user')

    await wrapper.findAll('[role="menuitem"]').find(item => item.text().includes('Settings'))!.trigger('click')
    expect(settings).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('emits download and logout from the overlay menu', async () => {
    const download = vi.fn()
    const logout = vi.fn()
    const wrapper = mount(SessionSidebarAccountMenu, {
      props: {
        username: 'theman',
        onDownload: download,
        onLogout: logout,
      },
      global: { components: { UIcon: IconStub } },
    })

    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    await wrapper.findAll('[role="menuitem"]').find(item => item.text().includes('Download file'))!.trigger('click')
    expect(download).toHaveBeenCalledOnce()

    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    await wrapper.findAll('[role="menuitem"]').find(item => item.text().includes('Logout'))!.trigger('click')
    expect(logout).toHaveBeenCalledOnce()
  })

  it('reveals external Documentation and GitHub links under Help', async () => {
    const wrapper = mount(SessionSidebarAccountMenu, {
      props: {
        username: 'theman',
      },
      global: { components: { UIcon: IconStub } },
    })

    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    const help = wrapper.findAll('[role="menuitem"]').find(item => item.text().includes('Help'))!
    expect(help.attributes('aria-expanded')).toBe('false')

    await help.trigger('click')
    expect(help.attributes('aria-expanded')).toBe('true')

    const documentation = wrapper.get('a[href="https://rebasereality.com/bitveins"]')
    const github = wrapper.get('a[href="https://github.com/rebasereality/bitveins"]')
    expect(documentation.text()).toContain('Documentation')
    expect(github.text()).toContain('GitHub')

    for (const link of [documentation, github]) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
  })
})
