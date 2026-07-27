// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AsyncTerminalHeader from '../../../app/components/AsyncTerminalHeader.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  emits: ['click'],
  props: {
    label: String,
    title: String,
  },
  template: '<button :title="title" @click="$emit(\'click\')">{{ label }}<slot /></button>',
})

describe('AsyncTerminalHeader Explorer tabs', () => {
  it('selects a tab from its body and closes it only from the close button', async () => {
    const closeFile = vi.fn()
    const selectFile = vi.fn()
    const wrapper = mount(AsyncTerminalHeader, {
      props: {
        viewMode: 'explorer',
        activeOpenFile: null,
        activeFilePath: 'one.ts',
        editingWindowIndex: null,
        openFiles: [
          {
            kind: 'text',
            path: 'one.ts',
            name: 'one.ts',
            content: '',
            originalContent: '',
            navigationToken: 1,
            isDirty: false,
          },
          {
            kind: 'image',
            path: 'preview.png',
            name: 'preview.png',
            mediaType: 'image/png',
            previewUrl: '/preview.png',
            size: 1,
            isDirty: false,
          },
        ],
        pathLinkRoot: null,
        hasPathLinkRoots: false,
        windowTabItems: [],
        windows: [],
        onCloseFile: closeFile,
        onSelectFile: selectFile,
      },
      global: {
        components: {
          PathLinkRootMenu: true,
          UButton: ButtonStub,
          UIcon: true,
          UTabs: true,
        },
      },
    })

    const tabs = wrapper.findAll('[data-explorer-tab]')
    await tabs[1]!.trigger('click')
    expect(selectFile).toHaveBeenCalledWith('preview.png')
    expect(closeFile).not.toHaveBeenCalled()

    await tabs[1]!.find('button[title="Close file"]').trigger('click')
    expect(closeFile).toHaveBeenCalledWith('preview.png')
  })

  it('offers an active text-file download action', async () => {
    const downloadActiveFile = vi.fn()
    const activeFile = {
      kind: 'text' as const,
      path: 'one.ts',
      name: 'one.ts',
      content: '',
      originalContent: '',
      navigationToken: 1,
      isDirty: false,
    }
    const wrapper = mount(AsyncTerminalHeader, {
      props: {
        viewMode: 'explorer',
        activeOpenFile: activeFile,
        activeFilePath: activeFile.path,
        editingWindowIndex: null,
        openFiles: [activeFile],
        pathLinkRoot: null,
        hasPathLinkRoots: false,
        windowTabItems: [],
        windows: [],
        onDownloadActiveFile: downloadActiveFile,
      },
      global: {
        components: {
          PathLinkRootMenu: true,
          UButton: ButtonStub,
          UIcon: true,
        },
      },
    })

    await wrapper.get('[title="Download active file"]').trigger('click')

    expect(downloadActiveFile).toHaveBeenCalledOnce()
  })
})
