// @vitest-environment happy-dom

import { computed, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTerminalSelection } from '../../../app/composables/useTerminalSelection'
import { parseFileReferences } from '../../../app/utils/file-reference-parser'

class TerminalSelectionFixture {
  buffer = { active: { viewportY: 0 } }
  cols = 10
  rows = 4
  selection = ''
  selectedRange: [column: number, row: number, length: number] | null = null

  clearSelection(): void {
    this.selection = ''
  }

  getSelection(): string {
    return this.selection
  }

  select(column: number, row: number, length: number): void {
    this.selectedRange = [column, row, length]
    this.selection = 'first.txt'
  }
}

describe('useTerminalSelection', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reacts to the complete selected text instead of only its boolean state', () => {
    const fixture = new TerminalSelectionFixture()
    const selection = useTerminalSelection({
      terminal: shallowRef(fixture),
      terminalHost: ref(null),
    })
    const references = computed(() => parseFileReferences(selection.selectedText.value))

    fixture.selection = 's'
    selection.onSelectionChange()
    expect(selection.hasSelection.value).toBe(true)
    expect(references.value).toEqual([])

    fixture.selection = 'second.txt'
    selection.onSelectionChange()
    expect(selection.hasSelection.value).toBe(true)
    expect(references.value).toMatchObject([{ path: 'second.txt' }])
  })

  it('clears both xterm and reactive selection state when leaving select mode', () => {
    const fixture = new TerminalSelectionFixture()
    const selection = useTerminalSelection({
      terminal: shallowRef(fixture),
      terminalHost: ref(null),
    })

    fixture.selection = 'first.txt'
    selection.onSelectionChange()
    selection.exitSelectMode()

    expect(fixture.selection).toBe('')
    expect(selection.selectedText.value).toBe('')
    expect(selection.hasSelection.value).toBe(false)
  })

  it('maps a mobile drag to a deterministic xterm cell range', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    const fixture = new TerminalSelectionFixture()
    const host = document.createElement('div')
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    host.appendChild(screen)
    vi.spyOn(screen, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const selection = useTerminalSelection({
      terminal: shallowRef(fixture),
      terminalHost: ref(host),
    })
    const pointer = {
      buttons: 1,
      clientX: 5,
      clientY: 5,
      preventDefault: vi.fn(),
      pointerId: 1,
      pointerType: 'touch',
    } as unknown as PointerEvent

    selection.onTerminalPointerDown(pointer)
    await vi.advanceTimersByTimeAsync(520)
    selection.onTerminalPointerMove({
      ...pointer,
      clientX: 95,
    })

    expect(selection.selectMode.value).toBe(true)
    expect(fixture.selectedRange).toEqual([0, 0, 10])
    expect(selection.selectedText.value).toBe('first.txt')
  })
})
