<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { nextTick, onMounted, ref, watch } from 'vue'
import type { LiveControlKey, LiveModifier, LiveModifiers } from '~/utils/terminal-controls'
import {
  liveControlOrderStorageKey,
  readLiveControlOrder,
  saveLiveControlOrder,
  shouldBlockLiveControlActivation,
} from '~/utils/live-control-order'

type LiveSendControl = {
  type: 'send'
  icon?: string
  id: string
  key: LiveControlKey
  label?: string
  modifiers?: Partial<LiveModifiers>
  title: string
}

type LiveModifierControl = {
  type: 'modifier'
  icon?: undefined
  id: string
  label: string
  modifier: LiveModifier
  title: string
}

type LiveControlItem = LiveSendControl | LiveModifierControl

const props = defineProps<{
  disabled: boolean
  modifiers: LiveModifiers
  sortable: boolean
}>()

const emit = defineEmits<{
  control: [key: LiveControlKey, modifiers?: Partial<LiveModifiers>]
  toggleModifier: [modifier: LiveModifier]
}>()

const controlList = ref<HTMLElement | null>(null)
const dragging = ref(false)
const lastDragEndedAt = ref(Number.NEGATIVE_INFINITY)

const defaultControls: LiveControlItem[] = [
  { type: 'modifier', id: 'modifier-ctrl', label: 'CTRL', modifier: 'ctrl', title: 'Apply Control to next live key' },
  { type: 'modifier', id: 'modifier-shift', label: 'SHIFT', modifier: 'shift', title: 'Apply Shift to next live key' },
  { type: 'modifier', id: 'modifier-alt', label: 'ALT', modifier: 'alt', title: 'Apply Alt to next live key' },
  { type: 'send', id: 'escape', label: 'Esc', key: 'escape', title: 'Escape' },
  { type: 'send', id: 'tab', label: 'Tab', key: 'tab', title: 'Tab' },
  { type: 'send', id: 'page-up', label: 'PgUp', key: 'pageUp', modifiers: { ctrl: true }, title: 'Tmux page up' },
  { type: 'send', id: 'page-down', label: 'PgDn', key: 'pageDown', title: 'Copy-mode page down' },
  { type: 'send', id: 'meta-comma', label: 'M-,', key: 'comma', modifiers: { alt: true }, title: 'Meta-comma' },
  { type: 'send', id: 'meta-period', label: 'M-.', key: 'period', modifiers: { alt: true }, title: 'Meta-period' },
  { type: 'send', id: 'control-c', label: 'C-c', key: 'c', modifiers: { ctrl: true }, title: 'Control C' },
  { type: 'send', id: 'control-d', label: 'C-d', key: 'd', modifiers: { ctrl: true }, title: 'Control D' },
  { type: 'send', id: 'arrow-left', icon: 'i-lucide-arrow-left', key: 'arrowLeft', title: 'Left' },
  { type: 'send', id: 'arrow-down', icon: 'i-lucide-arrow-down', key: 'arrowDown', title: 'Down' },
  { type: 'send', id: 'arrow-up', icon: 'i-lucide-arrow-up', key: 'arrowUp', title: 'Up' },
  { type: 'send', id: 'arrow-right', icon: 'i-lucide-arrow-right', key: 'arrowRight', title: 'Right' },
  { type: 'send', id: 'enter', icon: 'i-lucide-corner-down-left', key: 'enter', title: 'Enter' },
  { type: 'send', id: 'backspace', icon: 'i-lucide-delete', key: 'backspace', title: 'Backspace' },
]
const defaultControlIds = defaultControls.map(control => control.id)
const controls = ref<LiveControlItem[]>([...defaultControls])

const sortableControls = useSortable(controlList, controls, {
  animation: 150,
  delay: 150,
  delayOnTouchOnly: true,
  disabled: !props.sortable,
  dragClass: 'opacity-80',
  ghostClass: 'opacity-40',
  touchStartThreshold: 5,
  watchElement: true,
  onStart() {
    dragging.value = true
  },
  onEnd() {
    dragging.value = false
    lastDragEndedAt.value = Date.now()

    if (import.meta.client) {
      nextTick(() => saveLiveControlOrder(localStorage, controls.value.map(control => control.id)))
    }
  },
})

watch(() => props.sortable, (enabled) => {
  if (!enabled) {
    dragging.value = false
  }

  sortableControls.option('disabled', !enabled)
})

function orderedControls(orderedIds: readonly string[]): LiveControlItem[] {
  const defaultControlsById = new Map(defaultControls.map(control => [control.id, control]))
  const orderedControls: LiveControlItem[] = []

  for (const id of orderedIds) {
    const control = defaultControlsById.get(id)
    if (control) {
      orderedControls.push(control)
    }
  }

  return orderedControls
}

function activateControl(control: LiveControlItem): void {
  if (shouldBlockLiveControlActivation({
    dragging: dragging.value,
    lastDragEndedAt: lastDragEndedAt.value,
    now: Date.now(),
  })) {
    return
  }

  if (control.type === 'modifier') {
    emit('toggleModifier', control.modifier)
    return
  }

  emit('control', control.key, control.modifiers)
}

function preserveExplicitKeyboardState(event: PointerEvent): void {
  if (!props.disabled && event.pointerType === 'touch') {
    event.preventDefault()
  }
}

function controlClass(control: LiveControlItem): string {
  const layoutClass = control.icon ? 'size-11 justify-center' : 'h-11 font-mono'
  const interactionClass = props.sortable ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-default touch-pan-x'

  return `${layoutClass} ${interactionClass}`
}

onMounted(() => {
  if (import.meta.client) {
    const orderedIds = readLiveControlOrder(localStorage, defaultControlIds)
    controls.value = orderedControls(orderedIds)

    const serializedOrder = JSON.stringify(orderedIds)
    if (localStorage.getItem(liveControlOrderStorageKey) !== serializedOrder) {
      saveLiveControlOrder(localStorage, orderedIds)
    }
  }
})
</script>

<template>
  <div
    ref="controlList"
    class="flex items-center gap-2"
  >
    <div
      v-for="control in controls"
      :key="control.id"
      class="flex h-11 shrink-0"
      data-live-control-sortable-item
    >
      <UButton
        :disabled="disabled"
        :class="controlClass(control)"
        :color="control.type === 'modifier' && props.modifiers[control.modifier] ? 'primary' : 'neutral'"
        :icon="control.icon"
        :label="control.label"
        :square="Boolean(control.icon)"
        size="md"
        :title="control.title"
        type="button"
        :variant="control.type === 'modifier' && props.modifiers[control.modifier] ? 'solid' : 'subtle'"
        @pointerdown="preserveExplicitKeyboardState"
        @click="activateControl(control)"
      />
    </div>
  </div>
</template>
