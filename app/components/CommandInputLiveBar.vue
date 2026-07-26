<script setup lang="ts">
import { ref } from 'vue'
import type { InputMode } from '~/types/session'
import type { LiveControlKey, LiveModifier, LiveModifiers } from '~/utils/terminal-controls'

defineProps<{
  inputMode: InputMode
  keyboardOpen: boolean
  liveDisabled: boolean
  liveModifiers: LiveModifiers
  modeControls: Array<{ icon: string, label: string, mode: InputMode, title: string }>
}>()

const emit = defineEmits<{
  control: [key: LiveControlKey | string, itemModifiers?: Partial<LiveModifiers>]
  setMode: [mode: InputMode]
  toggleKeyboard: []
  toggleModifier: [modifier: LiveModifier]
}>()

const liveControlsSortable = ref(false)
</script>

<template>
  <div
    v-if="inputMode === 'live'"
    class="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2"
  >
    <div class="flex items-center justify-between gap-2 lg:hidden">
      <div class="flex items-center gap-1">
        <UButton
          v-for="control in modeControls"
          :key="control.mode"
          :color="inputMode === control.mode ? 'primary' : 'neutral'"
          class="h-7 px-2 text-xs font-semibold"
          :icon="control.icon"
          :label="control.label"
          size="xs"
          :title="control.title"
          type="button"
          :variant="inputMode === control.mode ? 'solid' : 'subtle'"
          @click="emit('setMode', control.mode)"
        />
      </div>

      <div class="flex items-center gap-1.5 text-xs text-[var(--bitveins-shell-text-subtle)]">
        <span>Reorder</span>
        <USwitch
          v-model="liveControlsSortable"
          size="xs"
          title="Reorder live controls"
        />
        <UButton
          :aria-label="keyboardOpen ? 'Hide keyboard' : 'Open keyboard'"
          :aria-pressed="keyboardOpen"
          :color="keyboardOpen ? 'primary' : 'neutral'"
          data-live-keyboard-toggle
          :disabled="liveDisabled"
          icon="i-lucide-keyboard"
          size="xs"
          square
          :title="keyboardOpen ? 'Hide keyboard' : 'Open keyboard'"
          type="button"
          :variant="keyboardOpen ? 'solid' : 'subtle'"
          @pointerdown.prevent
          @click="emit('toggleKeyboard')"
        />
      </div>
    </div>

    <div class="hidden w-24 shrink-0 flex-col gap-1 lg:flex">
      <UButton
        v-for="control in modeControls"
        :key="control.mode"
        :color="inputMode === control.mode ? 'primary' : 'neutral'"
        class="h-7 justify-start px-2 text-xs"
        :icon="control.icon"
        :label="control.label"
        size="xs"
        :title="control.title"
        type="button"
        :variant="inputMode === control.mode ? 'solid' : 'subtle'"
        @click="emit('setMode', control.mode)"
      />
    </div>

    <div class="min-w-0 flex-1 overflow-x-auto">
      <LiveSendControls
        :sortable="liveControlsSortable"
        :disabled="liveDisabled"
        :modifiers="liveModifiers"
        @control="(key, itemModifiers) => emit('control', key, itemModifiers)"
        @toggle-modifier="(mod) => emit('toggleModifier', mod)"
      />
    </div>

    <div class="hidden items-center gap-1.5 text-xs text-[var(--bitveins-shell-text-subtle)] lg:flex">
      <span>ORD</span>
      <USwitch
        v-model="liveControlsSortable"
        size="xs"
        title="Reorder live controls"
      />
    </div>
  </div>
</template>
