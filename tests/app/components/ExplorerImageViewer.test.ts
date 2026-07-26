// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ExplorerImageViewer from '../../../app/components/ExplorerImageViewer.vue'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

const ButtonStub = defineComponent({
  name: 'UButton',
  emits: ['click'],
  props: {
    label: String,
    title: String,
  },
  template: '<button :title="title" @click="$emit(\'click\')">{{ label }}<slot /></button>',
})

function mountViewer() {
  return mount(ExplorerImageViewer, {
    props: {
      document: {
        isDirty: false,
        kind: 'image',
        mediaType: 'image/png',
        name: 'preview.png',
        path: 'design/preview.png',
        previewUrl: '/preview.png',
        size: 1024,
      },
    },
    global: {
      components: {
        UButton: ButtonStub,
      },
    },
  })
}

describe('ExplorerImageViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    }
    else {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('shows a recoverable decode error', async () => {
    const wrapper = mountViewer()

    await wrapper.get('img').trigger('error')
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to decode')
    const retry = wrapper.findAll('button').find(button => button.text() === 'Retry')
    if (!retry) throw new Error('Retry button was not rendered.')
    await retry.trigger('click')
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('reports clipboard failures without an unhandled rejection', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    const wrapper = mountViewer()

    await wrapper.get('button[title="Copy relative path"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('design/preview.png')
    expect(alert).toHaveBeenCalledWith('Unable to copy the image path.')
  })
})
