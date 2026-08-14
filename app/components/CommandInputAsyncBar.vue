<script setup lang="ts">
import type { InputMode } from '~/types/session'

defineProps<{
  disabled: boolean
  focused?: boolean
  historyPreview: string
  inputMode: InputMode
  modeControls: Array<{ icon: string, label: string, mode: InputMode, title: string }>
  placeholder: string
  submittedPromptAvailable: boolean
}>()

const emit = defineEmits<{
  blur: []
  commitHistoryPreview: []
  focus: []
  keydown: [event: KeyboardEvent]
  onDrop: [event: DragEvent]
  onPaste: [event: ClipboardEvent]
  openDrawer: []
  restore: []
  setMode: [mode: InputMode]
  submit: []
}>()

const value = defineModel<string>('value', { default: '' })
const queueMode = defineModel<boolean>('queueMode', { default: false })

const textarea = ref<{ textareaRef?: HTMLTextAreaElement, autoResize?: () => void } | null>(null)

defineExpose({
  textareaRef: computed(() => textarea.value?.textareaRef),
  autoResize: () => textarea.value?.autoResize?.(),
})
</script>

<template>
  <div>
    <div
      v-if="inputMode === 'async'"
      class="flex items-end gap-2 max-lg:hidden"
    >
      <div class="flex w-24 shrink-0 flex-col gap-1">
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

      <div class="min-w-0 flex-1">
        <UTextarea
          ref="textarea"
          v-model="value"
          :autoresize="true"
          :disabled="disabled"
          :maxrows="8"
          :rows="2"
          class="w-full transition-opacity duration-150"
          :class="[focused ? 'opacity-100' : 'opacity-60 cursor-pointer']"
          :placeholder="placeholder"
          :ui="{ base: 'max-h-[30vh] min-h-[var(--bitveins-input-min-height)] overflow-y-auto bg-[var(--bitveins-shell-panel)] [font-family:var(--bitveins-prompt-font-family)] text-[length:var(--bitveins-input-font-size)] md:text-[length:var(--bitveins-input-font-size)] leading-[var(--bitveins-input-line-height)] text-[var(--bitveins-shell-text)] placeholder:text-[var(--bitveins-shell-text-subtle)]' }"
          @click="!value && historyPreview ? emit('commitHistoryPreview') : emit('focus')"
          @focus="emit('focus'); if (!value && historyPreview) emit('commitHistoryPreview')"
          @blur="emit('blur')"
          @keydown="emit('keydown', $event)"
          @paste="emit('onPaste', $event)"
          @dragover.prevent
          @drop="emit('onDrop', $event)"
        />
      </div>

      <div class="flex h-[var(--bitveins-input-min-height)] w-20 shrink-0 flex-col justify-between">
        <div class="flex h-4 items-center justify-center gap-1 text-[length:var(--bitveins-ui-caption-size)] leading-none text-[var(--bitveins-shell-text-subtle)]">
          <span>TAB</span>
          <USwitch
            v-model="queueMode"
            :disabled="disabled"
            class="scale-75"
            size="sm"
            title="Send with Tab instead of Enter"
          />
        </div>

        <div class="flex gap-1">
          <UButton
            v-if="submittedPromptAvailable && !value"
            :disabled="disabled"
            class="h-9 w-8 justify-center"
            color="neutral"
            icon="i-lucide-rotate-ccw"
            size="lg"
            title="Restore last sent command"
            type="button"
            variant="subtle"
            @click="emit('restore')"
          />

          <UButton
            :disabled="disabled || (!value.trim() && !historyPreview)"
            class="h-9 flex-1 justify-center"
            color="primary"
            icon="i-lucide-send-horizontal"
            size="lg"
            :title="queueMode ? 'Send with Tab (Ctrl+Enter)' : 'Send with Enter (Ctrl+Enter)'"
            type="button"
            variant="solid"
            @click="emit('submit')"
          />
        </div>
      </div>
    </div>

    <div
      v-if="inputMode === 'async'"
      class="hidden max-lg:flex max-lg:items-center max-lg:gap-1.5"
    >
      <UButton
        v-for="control in modeControls"
        :key="control.mode"
        :color="inputMode === control.mode ? 'primary' : 'neutral'"
        class="h-9 px-2 text-xs"
        :icon="control.icon"
        :label="control.label"
        size="xs"
        :title="control.title"
        type="button"
        :variant="inputMode === control.mode ? 'solid' : 'subtle'"
        @click="emit('setMode', control.mode)"
      />
      <div class="min-w-0 flex-1">
        <UInput
          class="w-full cursor-pointer transition-opacity duration-150"
          :class="[focused ? 'opacity-100' : 'opacity-60']"
          :disabled="disabled"
          :model-value="value"
          :placeholder="placeholder"
          readonly
          size="md"
          :ui="{ base: '[font-family:var(--bitveins-prompt-font-family)] text-[length:var(--bitveins-input-font-size)] md:text-[length:var(--bitveins-input-font-size)] cursor-pointer' }"
          @click="emit('openDrawer'); emit('focus')"
        />
      </div>
      <UButton
        :disabled="disabled || (!value.trim() && !historyPreview)"
        class="size-9 justify-center shrink-0"
        color="primary"
        icon="i-lucide-send-horizontal"
        size="md"
        square
        :title="queueMode ? 'Send with Tab (Ctrl+Enter)' : 'Send with Enter (Ctrl+Enter)'"
        type="button"
        variant="solid"
        @mousedown.prevent
        @pointerdown.prevent
        @click="emit('submit')"
      />
    </div>
  </div>
</template>
