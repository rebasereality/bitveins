// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  dragTypesContainFiles,
  useGlobalFileDrag,
} from '../../../app/composables/useGlobalFileDrag'

function dragEvent(type: string, types: string[]): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      dropEffect: 'none',
      files: [],
      types,
    },
  })
  return event
}

const Harness = defineComponent({
  props: {
    hasTargets: Boolean,
  },
  setup(props) {
    const targets = ref(props.hasTargets)
    const { isDraggingFiles } = useGlobalFileDrag(targets)
    return { isDraggingFiles }
  },
  template: '<span>{{ isDraggingFiles }}</span>',
})

describe('global file drag detection', () => {
  it('recognizes operating-system file drags', () => {
    expect(dragTypesContainFiles(['text/plain', 'Files'])).toBe(true)
  })

  it('ignores text and internal drag payloads', () => {
    expect(dragTypesContainFiles(['text/plain'])).toBe(false)
    expect(dragTypesContainFiles(['application/x-bitveins-tab'])).toBe(false)
    expect(dragTypesContainFiles(undefined)).toBe(false)
  })

  it('keeps the overlay stable across nested drag boundaries and resets on drop', async () => {
    const wrapper = mount(Harness, { props: { hasTargets: true } })

    window.dispatchEvent(dragEvent('dragenter', ['Files']))
    window.dispatchEvent(dragEvent('dragenter', ['Files']))
    await nextTick()
    expect(wrapper.text()).toBe('true')

    window.dispatchEvent(dragEvent('dragleave', ['Files']))
    await nextTick()
    expect(wrapper.text()).toBe('true')

    window.dispatchEvent(dragEvent('drop', ['Files']))
    await nextTick()
    expect(wrapper.text()).toBe('false')

    wrapper.unmount()
  })

  it('prevents browser file navigation without displaying a dead overlay', async () => {
    const wrapper = mount(Harness, { props: { hasTargets: false } })
    const event = dragEvent('dragenter', ['Files'])

    expect(window.dispatchEvent(event)).toBe(false)
    await nextTick()
    expect(wrapper.text()).toBe('false')

    window.dispatchEvent(dragEvent('drop', ['Files']))
    wrapper.unmount()
  })
})
