// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent, toRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMobileLiveKeyboard } from '../../../app/composables/useMobileLiveKeyboard'

const onControl = vi.fn()
const onText = vi.fn()

const KeyboardHarness = defineComponent({
  props: {
    disabled: Boolean,
  },
  setup(props) {
    return useMobileLiveKeyboard({
      disabled: toRef(props, 'disabled'),
      onControl,
      onText,
    })
  },
  template: `
    <div>
      <input
        ref="input"
        data-keyboard-input
        :value="sentinel"
        @beforeinput="onBeforeInput"
        @blur="onBlur"
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
      >
      <button
        data-keyboard-toggle
        @pointerdown.prevent
        @click="toggle"
      >
        Toggle
      </button>
    </div>
  `,
})

describe('useMobileLiveKeyboard', () => {
  beforeEach(() => {
    onControl.mockClear()
    onText.mockClear()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('opens and closes the native input only through the explicit toggle', async () => {
    const wrapper = mount(KeyboardHarness, { attachTo: document.body })
    const input = wrapper.get<HTMLInputElement>('[data-keyboard-input]')
    const toggle = wrapper.get('[data-keyboard-toggle]')

    expect(wrapper.vm.isOpen).toBe(false)
    expect(document.activeElement).not.toBe(input.element)

    await toggle.trigger('click')

    expect(wrapper.vm.isOpen).toBe(true)
    expect(document.activeElement).toBe(input.element)

    await toggle.trigger('click')

    expect(wrapper.vm.isOpen).toBe(false)
    expect(document.activeElement).not.toBe(input.element)
  })

  it('closes immediately when Live input becomes disabled', async () => {
    const wrapper = mount(KeyboardHarness, { attachTo: document.body })
    const input = wrapper.get<HTMLInputElement>('[data-keyboard-input]')

    await wrapper.get('[data-keyboard-toggle]').trigger('click')
    expect(document.activeElement).toBe(input.element)

    await wrapper.setProps({ disabled: true })

    expect(wrapper.vm.isOpen).toBe(false)
    expect(document.activeElement).not.toBe(input.element)

    await wrapper.get('[data-keyboard-toggle]').trigger('click')
    expect(document.activeElement).not.toBe(input.element)
  })

  it('routes printable text and native control keys without losing its sentinel', async () => {
    const wrapper = mount(KeyboardHarness, { attachTo: document.body })
    const input = wrapper.get<HTMLInputElement>('[data-keyboard-input]')
    await wrapper.get('[data-keyboard-toggle]').trigger('click')

    input.element.value = `${wrapper.vm.sentinel}ab`
    input.element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: 'ab',
      inputType: 'insertText',
    }))

    expect(onText).toHaveBeenCalledWith('ab')
    expect(input.element.value).toBe(wrapper.vm.sentinel)

    const backspace = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Backspace',
    })
    input.element.dispatchEvent(backspace)
    const enter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    })
    input.element.dispatchEvent(enter)
    const unidentifiedGboardEnter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Unidentified',
    })
    Object.defineProperty(unidentifiedGboardEnter, 'keyCode', { value: 13 })
    input.element.dispatchEvent(unidentifiedGboardEnter)

    expect(backspace.defaultPrevented).toBe(true)
    expect(enter.defaultPrevented).toBe(true)
    expect(unidentifiedGboardEnter.defaultPrevented).toBe(true)
    expect(onControl).toHaveBeenNthCalledWith(1, 'backspace', {
      alt: false,
      ctrl: false,
      shift: false,
    })
    expect(onControl).toHaveBeenNthCalledWith(2, 'enter', {
      alt: false,
      ctrl: false,
      shift: false,
    })
    expect(onControl).toHaveBeenNthCalledWith(3, 'enter', {
      alt: false,
      ctrl: false,
      shift: false,
    })
  })

  it('uses beforeinput as a fallback for mobile deletion and line breaks', () => {
    const wrapper = mount(KeyboardHarness, { attachTo: document.body })
    const input = wrapper.get<HTMLInputElement>('[data-keyboard-input]')
    const backspace = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
    })
    const enter = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    })

    input.element.dispatchEvent(backspace)
    input.element.dispatchEvent(enter)

    expect(backspace.defaultPrevented).toBe(true)
    expect(enter.defaultPrevented).toBe(true)
    expect(onControl).toHaveBeenNthCalledWith(1, 'backspace')
    expect(onControl).toHaveBeenNthCalledWith(2, 'enter')
  })
})
