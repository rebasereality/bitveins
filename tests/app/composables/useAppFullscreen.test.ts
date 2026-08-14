// @vitest-environment happy-dom

import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppFullscreen } from '../../../app/composables/useAppFullscreen'

function mountFullscreen() {
  return mount(defineComponent({
    setup() {
      return useAppFullscreen()
    },
    template: '<button @click="toggle">{{ isFullscreen }}</button>',
  }))
}

describe('useAppFullscreen', () => {
  afterEach(() => {
    document.exitFullscreen = undefined as never
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  })

  it('enters and exits document fullscreen from the same toggle', async () => {
    const element = document.documentElement as HTMLElement & {
      requestFullscreen: () => Promise<void>
    }
    let active: Element | null = null
    element.requestFullscreen = vi.fn(async () => {
      active = element
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    document.exitFullscreen = vi.fn(async () => {
      active = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => active,
    })

    const wrapper = mountFullscreen()
    expect(wrapper.text()).toBe('false')

    await wrapper.get('button').trigger('click')
    await Promise.resolve()
    expect(element.requestFullscreen).toHaveBeenCalledOnce()
    expect(wrapper.text()).toBe('true')

    await wrapper.get('button').trigger('click')
    await Promise.resolve()
    expect(document.exitFullscreen).toHaveBeenCalledOnce()
    expect(wrapper.text()).toBe('false')
    wrapper.unmount()
  })
})
