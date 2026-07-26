// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppearanceSizeSetting from '../../../app/components/AppearanceSizeSetting.vue'

describe('AppearanceSizeSetting', () => {
  it('renders five graduated sizes and a live preview', async () => {
    const update = vi.fn()
    const wrapper = mount(AppearanceSizeSetting, {
      props: {
        description: 'Independent sizing',
        modelValue: 0,
        ...{ 'onUpdate:modelValue': update },
        title: 'Terminal font size',
        valueLabel: '13px',
      },
      slots: {
        default: '<div data-preview>Preview</div>',
      },
    })

    const range = wrapper.get('input[type="range"]')
    expect(range.attributes()).toMatchObject({ min: '0', max: '4', step: '1' })
    expect(wrapper.findAll('button')).toHaveLength(5)
    expect(wrapper.findAll('.appearance-step-marker')).toHaveLength(5)
    expect(wrapper.findAll('[data-appearance-step]').map(button => button.attributes('style'))).toEqual([
      'left: 0%;',
      'left: 25%;',
      'left: 50%;',
      'left: 75%;',
      'left: 100%;',
    ])
    expect(wrapper.get('[data-preview]').text()).toBe('Preview')

    expect(wrapper.findAll('button').map(button => button.text())).toEqual([
      'Compact1',
      'Small2',
      'Medium3',
      'Large4',
      'Extra large5',
    ])
    expect(wrapper.findAll('.appearance-step-marker').map(marker => (
      marker.attributes('data-step-state')
    ))).toEqual(['selected', 'idle', 'idle', 'idle', 'idle'])

    await wrapper.get('[data-appearance-step="3"]').trigger('click')
    expect(update).toHaveBeenCalledWith(3)
  })
})
