// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LiveSendControls from '../../../app/components/LiveSendControls.vue'

const sortableOption = vi.fn()

vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: () => ({
    option: sortableOption,
  }),
}))

const UButtonStub = defineComponent({
  name: 'UButton',
  props: {
    disabled: Boolean,
    label: String,
    title: String,
  },
  template: `
    <button
      :disabled="disabled"
      :title="title"
    >{{ label }}</button>
  `,
})

function mountControls(sortable = false) {
  return mount(LiveSendControls, {
    props: {
      disabled: false,
      modifiers: { alt: false, ctrl: false, shift: false },
      sortable,
    },
    global: {
      components: {
        UButton: UButtonStub,
      },
    },
  })
}

describe('LiveSendControls', () => {
  beforeEach(() => {
    sortableOption.mockClear()
  })

  it('reflects active modifier state in the rendered controls', async () => {
    const wrapper = mountControls()
    const ctrlButton = wrapper.findAllComponents(UButtonStub).find(button => button.props('label') === 'CTRL')

    expect(ctrlButton).toBeDefined()
    expect(ctrlButton!.attributes('color')).toBe('neutral')

    await wrapper.setProps({
      modifiers: { alt: false, ctrl: true, shift: false },
    })

    expect(ctrlButton!.attributes('color')).toBe('primary')
  })

  it('renders the fixed control set with accessible titles', () => {
    const wrapper = mountControls()
    const controlCButton = wrapper.findAllComponents(UButtonStub).find(button => button.props('label') === 'C-c')

    expect(controlCButton).toBeDefined()
    expect(controlCButton!.props('title')).toBe('Control C')
    expect(wrapper.findAllComponents(UButtonStub)).toHaveLength(17)
  })

  it('updates sortable behavior reactively', async () => {
    const wrapper = mountControls()

    await wrapper.setProps({ sortable: true })

    expect(sortableOption).toHaveBeenLastCalledWith('disabled', false)
  })

  it('does not move focus away from the explicit mobile keyboard', () => {
    const wrapper = mountControls()
    const controlCButton = wrapper.findAllComponents(UButtonStub).find(button => button.props('label') === 'C-c')
    const pointerDown = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
    })

    controlCButton!.element.dispatchEvent(pointerDown)

    expect(pointerDown.defaultPrevented).toBe(true)
  })

  it('keeps desktop pointer events available for native sorting', () => {
    const wrapper = mountControls(true)
    const controlCButton = wrapper.findAllComponents(UButtonStub).find(button => button.props('label') === 'C-c')
    const pointerDown = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
    })

    controlCButton!.element.dispatchEvent(pointerDown)

    expect(pointerDown.defaultPrevented).toBe(false)
  })
})
