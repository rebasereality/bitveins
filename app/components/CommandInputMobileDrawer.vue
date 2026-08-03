<script setup lang="ts">
import CommandHistoryActions from '~/components/CommandHistoryActions.vue'

const props = defineProps<{
  canHistoryDown: boolean
  canHistoryUp: boolean
  disabled: boolean
  historyPreview: string
  placeholder: string
  queueMode: boolean
  submittedPromptAvailable: boolean
}>()

const emit = defineEmits<{
  commitHistoryPreview: []
  focus: []
  historyDown: []
  historyUp: []
  keydown: [event: KeyboardEvent]
  onDrop: [event: DragEvent]
  onPaste: [event: ClipboardEvent]
  readAndUploadClipboard: []
  restore: []
  submit: []
}>()

const drawerOpen = defineModel<boolean>('drawerOpen', { default: false })
const value = defineModel<string>('value', { default: '' })
const queueModeModel = defineModel<boolean>('queueMode', { default: false })
const mobileTextarea = ref<{ textareaRef?: HTMLTextAreaElement, autoResize?: () => void } | null>(null)

function commitHistoryPreview(): void {
  if (!value.value && props.historyPreview) {
    emit('commitHistoryPreview')
  }
}

defineExpose({
  textareaRef: computed(() => mobileTextarea.value?.textareaRef),
  autoResize: () => mobileTextarea.value?.autoResize?.(),
})
</script>

<template>
  <USlideover
    v-model:open="drawerOpen"
    side="bottom"
    :restore-focus="false"
    :ui="{
      content: 'max-h-[85dvh] bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)] border-t border-[var(--bitveins-shell-border)] p-1.5 rounded-t-xl shadow-2xl',
      header: 'hidden',
      body: 'flex flex-col gap-1 p-0 pb-[calc(4px+env(safe-area-inset-bottom))]',
    }"
  >
    <template #body>
      <div class="flex items-center justify-end touch-none px-0.5 pt-0.5">
        <div class="flex items-center gap-1">
          <label
            class="inline-flex size-7 shrink-0 items-center justify-center rounded text-[var(--bitveins-shell-text-muted)] hover:text-[var(--bitveins-shell-text)] hover:bg-[var(--bitveins-shell-panel-muted)] cursor-pointer transition-colors"
            title="Upload image or file"
            for="bitveins-file-upload-input"
            @mousedown.prevent
            @pointerdown.prevent
          >
            <UIcon
              name="i-lucide-image"
              class="size-4"
            />
          </label>

          <UButton
            color="neutral"
            icon="i-lucide-clipboard-paste"
            size="xs"
            square
            title="Paste clipboard text or file"
            variant="ghost"
            @mousedown.prevent
            @pointerdown.prevent
            @click="emit('readAndUploadClipboard')"
          />

          <UButton
            color="neutral"
            icon="i-lucide-keyboard"
            size="xs"
            square
            title="Keyboard"
            variant="ghost"
            @mousedown.prevent
            @pointerdown.prevent
            @click="emit('focus')"
          />
        </div>
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto"
        @paste="emit('onPaste', $event)"
      >
        <UTextarea
          ref="mobileTextarea"
          v-model="value"
          :autofocus="true"
          :autoresize="true"
          :disabled="disabled"
          :maxrows="10"
          :rows="4"
          class="w-full"
          :placeholder="placeholder"
          :ui="{ base: 'max-h-[45vh] min-h-28 overflow-y-auto bg-[var(--bitveins-shell-panel)] [font-family:var(--bitveins-prompt-font-family)] text-[length:var(--bitveins-input-font-size)] md:text-[length:var(--bitveins-input-font-size)] leading-[var(--bitveins-input-line-height)] text-[var(--bitveins-shell-text)] placeholder:text-[var(--bitveins-shell-text-subtle)] p-2' }"
          @click="commitHistoryPreview"
          @focus="commitHistoryPreview"
          @keydown="emit('keydown', $event)"
          @dragover.prevent
          @drop="emit('onDrop', $event)"
        />
      </div>

      <div class="shrink-0 flex items-center justify-between border-t border-[var(--bitveins-shell-border)] pt-1.5 mt-0.5">
        <div class="flex items-center gap-2">
          <CommandHistoryActions
            :can-down="canHistoryDown"
            :can-up="canHistoryUp"
            :disabled="disabled"
            @down="emit('historyDown')"
            @up="emit('historyUp')"
          />

          <div class="flex items-center gap-1 text-xs text-[var(--bitveins-shell-text-subtle)]">
            <span>TAB</span>
            <USwitch
              v-model="queueModeModel"
              :disabled="disabled"
              size="xs"
              title="Send with Tab instead of Enter"
            />
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <UButton
            v-if="submittedPromptAvailable && !value"
            :disabled="disabled"
            color="neutral"
            icon="i-lucide-rotate-ccw"
            size="xs"
            square
            title="Restore last sent command"
            type="button"
            variant="subtle"
            @mousedown.prevent
            @pointerdown.prevent
            @click="emit('restore')"
          />

          <UButton
            color="neutral"
            label="Cancel"
            size="xs"
            type="button"
            variant="ghost"
            @click="drawerOpen = false"
          />

          <UButton
            :disabled="disabled || (!value.trim() && !placeholder)"
            color="primary"
            icon="i-lucide-send-horizontal"
            label="Send"
            size="xs"
            type="button"
            variant="solid"
            @mousedown.prevent
            @pointerdown.prevent
            @click="emit('submit')"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
