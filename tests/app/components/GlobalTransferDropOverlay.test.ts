// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GlobalTransferDropOverlay from '../../../app/components/GlobalTransferDropOverlay.vue'

const IconStub = defineComponent({
  name: 'UIcon',
  template: '<span />',
})

function fileDragEvent(type: string, files: File[] = []): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      dropEffect: 'none',
      files,
      types: ['Files'],
    },
  })
  return event
}

async function revealOverlay(): Promise<void> {
  await nextTick()
  window.dispatchEvent(fileDragEvent('dragenter'))
  await nextTick()
}

afterEach(() => {
  window.dispatchEvent(new Event('blur'))
  document.body.innerHTML = ''
})

describe('GlobalTransferDropOverlay', () => {
  it('balances five Transfers as three plus two above Current prompt', async () => {
    const dropzones = Array.from({ length: 5 }, (_, index) => ({
      name: `Destination ${index + 1}`,
      path: `/tmp/${index + 1}`,
    }))
    const wrapper = mount(GlobalTransferDropOverlay, {
      attachTo: document.body,
      props: {
        currentPromptAvailable: true,
        currentPromptLabel: 'docs / shell',
        dropzones,
      },
      global: {
        components: { UIcon: IconStub },
        stubs: { teleport: true, transition: false },
      },
    })

    await revealOverlay()

    const rows = document.querySelectorAll('[data-transfer-destination-row]')
    expect(document.querySelector('[data-global-transfer-overlay]')).not.toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelectorAll('[data-transfer-drop-target]')).toHaveLength(3)
    expect(rows[1]!.querySelectorAll('[data-transfer-drop-target]')).toHaveLength(2)
    expect(document.querySelector('[data-current-prompt-drop-target]')?.textContent).toContain('docs / shell')

    wrapper.unmount()
  })

  it('uses the full overlay for Current prompt when no Transfers exist', async () => {
    const wrapper = mount(GlobalTransferDropOverlay, {
      attachTo: document.body,
      props: {
        currentPromptAvailable: true,
        currentPromptLabel: 'main / shell',
        dropzones: [],
      },
      global: {
        components: { UIcon: IconStub },
        stubs: { teleport: true, transition: false },
      },
    })

    await revealOverlay()

    expect(document.querySelector('[data-transfer-destination-grid]')).toBeNull()
    expect(document.querySelector('[data-current-prompt-drop-target]')).not.toBeNull()
    expect(document.querySelector('[data-global-transfer-overlay]')?.getAttribute('style')).toContain('minmax(0, 1fr)')

    wrapper.unmount()
  })

  it('hides Current prompt while preserving Transfer targets', async () => {
    const wrapper = mount(GlobalTransferDropOverlay, {
      attachTo: document.body,
      props: {
        currentPromptAvailable: false,
        currentPromptLabel: null,
        dropzones: [{ name: 'Docs', path: '/workspace/docs' }],
      },
      global: {
        components: { UIcon: IconStub },
        stubs: { teleport: true, transition: false },
      },
    })

    await revealOverlay()

    expect(document.querySelector('[data-current-prompt-drop-target]')).toBeNull()
    expect(document.querySelectorAll('[data-transfer-drop-target]')).toHaveLength(1)

    wrapper.unmount()
  })

  it('emits dropped files for the selected Transfer', async () => {
    const dropzone = { name: 'Docs', path: '/workspace/docs' }
    const onDropTransfer = vi.fn()
    const wrapper = mount(GlobalTransferDropOverlay, {
      attachTo: document.body,
      props: {
        currentPromptAvailable: false,
        currentPromptLabel: null,
        dropzones: [dropzone],
        onDropTransfer,
      },
      global: {
        components: { UIcon: IconStub },
        stubs: { teleport: true, transition: false },
      },
    })
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    await revealOverlay()
    document.querySelector('[data-transfer-drop-target]')!.dispatchEvent(fileDragEvent('drop', [file]))
    await nextTick()

    expect(onDropTransfer).toHaveBeenCalledWith({
      dropzone,
      files: [file],
    })

    wrapper.unmount()
  })

  it('exposes a clear active state while hovering a destination', async () => {
    const wrapper = mount(GlobalTransferDropOverlay, {
      attachTo: document.body,
      props: {
        currentPromptAvailable: false,
        currentPromptLabel: null,
        dropzones: [{ name: 'Docs', path: '/workspace/docs' }],
      },
      global: {
        components: { UIcon: IconStub },
        stubs: { teleport: true, transition: false },
      },
    })

    await revealOverlay()
    const target = document.querySelector('[data-transfer-drop-target]')!
    expect(target.getAttribute('data-drop-active')).toBe('false')
    expect(target.textContent).toContain('Drop files here')

    target.dispatchEvent(fileDragEvent('dragenter'))
    await nextTick()

    expect(target.getAttribute('data-drop-active')).toBe('true')
    expect(target.textContent).toContain('Release to transfer')

    wrapper.unmount()
  })

  it('emits dropped files for Current prompt', async () => {
    const onDropCurrentPrompt = vi.fn()
    const wrapper = mount(GlobalTransferDropOverlay, {
      attachTo: document.body,
      props: {
        currentPromptAvailable: true,
        currentPromptLabel: 'main / shell',
        dropzones: [],
        onDropCurrentPrompt,
      },
      global: {
        components: { UIcon: IconStub },
        stubs: { teleport: true, transition: false },
      },
    })
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    await revealOverlay()
    document.querySelector('[data-current-prompt-drop-target]')!.dispatchEvent(fileDragEvent('drop', [file]))
    await nextTick()

    expect(onDropCurrentPrompt).toHaveBeenCalledWith([file])

    wrapper.unmount()
  })
})
