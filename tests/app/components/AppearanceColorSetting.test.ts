// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppearanceColorSetting from '../../../app/components/AppearanceColorSetting.vue'

const IconStub = defineComponent({
  name: 'UIcon',
  template: '<span />',
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppearanceColorSetting', () => {
  it('renders split Tailwind swatches and emits the selected accent', async () => {
    vi.stubGlobal('useColorMode', () => ref('dark'))
    const update = vi.fn()
    const wrapper = mount(AppearanceColorSetting, {
      props: {
        modelValue: 'indigo',
        ...{ 'onUpdate:modelValue': update },
      },
      global: {
        components: { UIcon: IconStub },
      },
    })

    const options = wrapper.findAll('[data-accent-option]')
    expect(options).toHaveLength(9)
    expect(options[0]!.attributes('aria-pressed')).toBe('true')
    expect(options[0]!.get('span').attributes('style')).toContain(
      'linear-gradient(135deg, #4f46e5 0 50%, #818cf8 50% 100%)',
    )

    await wrapper.get('[data-accent-option="amber"]').trigger('click')
    expect(update).toHaveBeenCalledWith('amber')

    const previewStyle = wrapper.get('[data-accent-contrast-preview]').attributes('style')
    expect(previewStyle).toContain('background-color: #818cf8')
    expect(previewStyle).toContain('color: #111827')
  })
})
