// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import CommandInputLiveBar from '../../../app/components/CommandInputLiveBar.vue'

const UButtonStub = defineComponent({
  name: 'UButton',
  emits: ['click'],
  props: {
    disabled: Boolean,
    label: String,
    title: String,
  },
  template: '<button :disabled="disabled" :title="title" @click="$emit(\'click\')">{{ label }}</button>',
})

const USwitchStub = defineComponent({
  name: 'USwitch',
  props: {
    modelValue: Boolean,
    title: String,
  },
  emits: ['update:modelValue'],
  template: '<button role="switch" :title="title" @click="$emit(\'update:modelValue\', !modelValue)" />',
})

function mountLiveBar(keyboardOpen = false) {
  return mount(CommandInputLiveBar, {
    props: {
      inputMode: 'live',
      keyboardOpen,
      liveDisabled: false,
      liveModifiers: { alt: false, ctrl: false, shift: false },
      modeControls: [
        { icon: 'async', label: 'Async', mode: 'async', title: 'Async input' },
        { icon: 'live', label: 'Live', mode: 'live', title: 'Live input' },
      ],
    },
    global: {
      components: {
        LiveSendControls: true,
        UButton: UButtonStub,
        USwitch: USwitchStub,
      },
    },
  })
}

describe('CommandInputLiveBar', () => {
  it('places an explicit keyboard toggle after the mobile reorder control', () => {
    const wrapper = mountLiveBar()
    const reorder = wrapper.get('[title="Reorder live controls"]')
    const keyboard = wrapper.get('[data-live-keyboard-toggle]')

    expect(reorder.element.compareDocumentPosition(keyboard.element) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
    expect(keyboard.attributes('aria-label')).toBe('Open keyboard')
    expect(keyboard.attributes('aria-pressed')).toBe('false')
  })

  it('announces the active keyboard state', () => {
    const keyboard = mountLiveBar(true).get('[data-live-keyboard-toggle]')

    expect(keyboard.attributes('aria-label')).toBe('Hide keyboard')
    expect(keyboard.attributes('aria-pressed')).toBe('true')
  })
})
