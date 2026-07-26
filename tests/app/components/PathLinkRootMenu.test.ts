// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import PathLinkRootMenu from '../../../app/components/PathLinkRootMenu.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  emits: ['click'],
  inheritAttrs: false,
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

function mountMenu(currentRoot: string | null = 'project-one') {
  return mount(PathLinkRootMenu, {
    props: {
      currentRoot,
      hasAny: Boolean(currentRoot),
    },
    global: {
      components: {
        UButton: ButtonStub,
      },
    },
  })
}

describe('PathLinkRootMenu', () => {
  it('closes on Escape and outside pointer input', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('button[title="More terminal actions"]')

    await trigger.trigger('click')
    expect(wrapper.get('[role="menu"]').isVisible()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await trigger.trigger('click')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('disables destructive actions when no root exists', async () => {
    const wrapper = mountMenu(null)
    await wrapper.get('button[title="More terminal actions"]').trigger('click')

    expect(wrapper.get('button:nth-of-type(2)').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button:nth-of-type(3)').attributes('disabled')).toBeDefined()
  })
})
