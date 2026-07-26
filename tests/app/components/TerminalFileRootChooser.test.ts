// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import type { TerminalFileResolution } from '#shared/contracts/explorer'
import TerminalFileRootChooser from '../../../app/components/TerminalFileRootChooser.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  emits: ['click'],
  props: {
    label: String,
  },
  template: '<button @click="$emit(\'click\')">{{ label }}</button>',
})

function resolution(root = 'project-one'): Extract<TerminalFileResolution, { status: 'ambiguous' }> {
  const candidate = {
    absolutePath: `/workspace/${root}/src/file.ts`,
    kind: 'text' as const,
    name: 'file.ts',
    path: `${root}/src/file.ts`,
    root,
    size: 10,
  }
  return {
    status: 'ambiguous',
    reference: { path: 'src/file.ts' },
    candidates: [
      candidate,
      {
        ...candidate,
        absolutePath: '/workspace/project-two/src/file.ts',
        path: 'project-two/src/file.ts',
        root: 'project-two',
      },
    ],
  }
}

describe('TerminalFileRootChooser', () => {
  it('keeps remembering opt-in and resets it for each ambiguity', async () => {
    const wrapper = mount(TerminalFileRootChooser, {
      props: { resolution: resolution() },
      global: { components: { UButton: ButtonStub } },
    })
    const checkbox = wrapper.get('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)

    await checkbox.setValue(true)
    await wrapper.setProps({ resolution: null })
    await wrapper.setProps({ resolution: resolution('project-three') })
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })
})
