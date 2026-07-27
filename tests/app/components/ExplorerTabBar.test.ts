// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ExplorerTabBar from '../../../app/components/ExplorerTabBar.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  emits: ['click'],
  props: {
    label: String,
    title: String,
  },
  template: '<button :title="title" @click="$emit(\'click\')">{{ label }}<slot /></button>',
})

describe('ExplorerTabBar', () => {
  it('selects a tab from its body and closes it only from the close button', async () => {
    const closeFile = vi.fn()
    const selectFile = vi.fn()
    const wrapper = mount(ExplorerTabBar, {
      props: {
        activeOpenFile: null,
        activeFilePath: 'one.ts',
        openFiles: [
          {
            kind: 'text',
            path: 'one.ts',
            name: 'one.ts',
            content: '',
            originalContent: '',
            navigationToken: 1,
            previewEnabled: false,
            size: 0,
            isDirty: false,
          },
          {
            kind: 'image',
            path: 'preview.png',
            name: 'preview.png',
            mediaType: 'image/png',
            previewMediaType: 'image/png',
            previewUrl: '/preview.png',
            size: 1,
            isDirty: false,
          },
        ],
        onCloseFile: closeFile,
        onSelectFile: selectFile,
      },
      global: {
        components: {
          UButton: ButtonStub,
          UIcon: true,
        },
      },
    })

    const tabs = wrapper.findAll('[data-explorer-tab]')
    await tabs[1]!.trigger('click')
    expect(selectFile).toHaveBeenCalledWith('preview.png')
    expect(closeFile).not.toHaveBeenCalled()

    await tabs[1]!.find('button[title="Close file"]').trigger('click')
    expect(closeFile).toHaveBeenCalledWith('preview.png')

    await tabs[0]!.trigger('auxclick', { button: 1 })
    expect(closeFile).toHaveBeenCalledWith('one.ts')
  })

  it('offers Preview and Download actions for previewable source files', async () => {
    const downloadActiveFile = vi.fn()
    const togglePreview = vi.fn()
    const activeFile = {
      kind: 'text' as const,
      path: 'one.ts',
      name: 'one.ts',
      content: '',
      originalContent: '',
      navigationToken: 1,
      previewEnabled: true,
      previewKind: 'markdown' as const,
      size: 0,
      isDirty: false,
    }
    const wrapper = mount(ExplorerTabBar, {
      props: {
        activeOpenFile: activeFile,
        activeFilePath: activeFile.path,
        openFiles: [activeFile],
        onDownloadActiveFile: downloadActiveFile,
        onTogglePreview: togglePreview,
      },
      global: {
        components: {
          UButton: ButtonStub,
          UIcon: true,
        },
      },
    })

    await wrapper.get('[title="Show source"]').trigger('click')
    await wrapper.get('[title="Download active file"]').trigger('click')

    expect(togglePreview).toHaveBeenCalledOnce()
    expect(downloadActiveFile).toHaveBeenCalledOnce()
  })
})
