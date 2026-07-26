// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SessionSidebarTransfers from '../../../app/components/SessionSidebarTransfers.vue'

const IconStub = defineComponent({
  name: 'UIcon',
  props: { name: String },
  template: '<span :data-icon="name" />',
})

const ButtonStub = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  emits: ['click'],
  props: { label: String },
  template: '<button v-bind="$attrs" @click="$emit(\'click\')">{{ label }}<slot /></button>',
})

describe('SessionSidebarTransfers', () => {
  it('keeps destinations in a popover and exposes open, upload, create and secondary delete actions', async () => {
    const dropzone = { name: 'Screenshots', path: '/tmp/screenshots' }
    const create = vi.fn()
    const deleteDestination = vi.fn()
    const pick = vi.fn()
    const wrapper = mount(SessionSidebarTransfers, {
      props: {
        dropzones: [dropzone],
        dropzoneUploads: {},
        onCreate: create,
        onDelete: deleteDestination,
        onPick: pick,
      },
      global: {
        components: {
          UButton: ButtonStub,
          UIcon: IconStub,
        },
      },
    })

    expect(wrapper.text()).toBe('Transfers')
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.text()).toContain('/tmp/screenshots')

    await wrapper.find('button[aria-label="Upload to Screenshots"]').trigger('click')
    expect(pick).toHaveBeenCalledWith(dropzone)

    await wrapper.find('button[aria-label="Actions for Screenshots"]').trigger('click')
    await wrapper.findAll('[role="menuitem"]').find(item => item.text().includes('Delete'))!.trigger('click')
    expect(deleteDestination).toHaveBeenCalledWith(0)

    await wrapper.find('button[aria-label="Create transfer destination"]').trigger('click')
    expect(create).toHaveBeenCalledOnce()
  })

  it('shows inline progress for uploads started from the global overlay or picker', async () => {
    const dropzone = { name: 'Artifacts', path: '/tmp/artifacts' }
    const wrapper = mount(SessionSidebarTransfers, {
      props: {
        dropzones: [dropzone],
        dropzoneUploads: {
          'Artifacts-1': {
            destinationName: 'Artifacts',
            destinationPath: '/tmp/artifacts',
            file: 'build.zip',
            progress: 42,
            status: 'uploading',
          },
        },
      },
      global: {
        components: {
          UButton: ButtonStub,
          UIcon: IconStub,
        },
      },
    })

    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.text()).toContain('build.zip')
    expect(wrapper.text()).toContain('42%')
  })
})
