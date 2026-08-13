<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Dropzone } from '~/composables/useSessionDropzones'
import { useGlobalFileDrag } from '~/composables/useGlobalFileDrag'
import { balancedTransferRows } from '~/utils/transfer-grid'

const props = defineProps<{
  currentPromptAvailable: boolean
  currentPromptLabel: string | null
  dropzones: Dropzone[]
}>()

const emit = defineEmits<{
  dropCurrentPrompt: [files: File[]]
  dropTransfer: [payload: { dropzone: Dropzone, files: File[] }]
}>()

const hasTargets = computed(() => props.currentPromptAvailable || props.dropzones.length > 0)
const { isDraggingFiles } = useGlobalFileDrag(hasTargets)
const hoveredTarget = ref<string | null>(null)

const transferRows = computed(() => {
  const rowSizes = balancedTransferRows(props.dropzones.length)
  let offset = 0
  return rowSizes.map((size) => {
    const row = props.dropzones.slice(offset, offset + size)
    offset += size
    return row
  })
})

const overlayRows = computed(() => {
  if (props.currentPromptAvailable && props.dropzones.length > 0) {
    return 'minmax(0, 2fr) minmax(0, 1fr)'
  }
  return 'minmax(0, 1fr)'
})

function draggedFiles(event: DragEvent): File[] {
  return event.dataTransfer?.files?.length
    ? Array.from(event.dataTransfer.files)
    : []
}

function leaveTarget(event: DragEvent, key: string): void {
  const currentTarget = event.currentTarget
  if (
    currentTarget instanceof Node
    && event.relatedTarget instanceof Node
    && currentTarget.contains(event.relatedTarget)
  ) {
    return
  }
  if (hoveredTarget.value === key) hoveredTarget.value = null
}

function dropOnTransfer(event: DragEvent, dropzone: Dropzone): void {
  const files = draggedFiles(event)
  hoveredTarget.value = null
  if (files.length > 0) emit('dropTransfer', { dropzone, files })
}

function dropOnCurrentPrompt(event: DragEvent): void {
  const files = draggedFiles(event)
  hoveredTarget.value = null
  if (files.length > 0) emit('dropCurrentPrompt', files)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDraggingFiles"
        class="global-transfer-overlay fixed inset-0 z-[110] grid gap-2 p-2 text-[var(--bitveins-shell-text)]"
        data-global-transfer-overlay
        :style="{ gridTemplateRows: overlayRows }"
      >
        <section
          v-if="dropzones.length > 0"
          class="dropzone-scroll-area min-h-0 overflow-y-auto p-1"
          aria-label="Transfer destinations"
          data-transfer-destination-grid
        >
          <div
            class="grid min-h-full gap-2"
            :style="{ gridTemplateRows: `repeat(${transferRows.length}, minmax(96px, 1fr))` }"
          >
            <div
              v-for="(row, rowIndex) in transferRows"
              :key="rowIndex"
              class="grid min-h-24 gap-2"
              data-transfer-destination-row
              :style="{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }"
            >
              <div
                v-for="dropzone in row"
                :key="`${dropzone.name}:${dropzone.path}`"
                class="drop-surface group grid min-h-0 place-items-center overflow-hidden rounded-lg border p-4 text-center"
                :aria-label="`Transfer to ${dropzone.name}`"
                :data-drop-active="hoveredTarget === `transfer:${dropzone.name}:${dropzone.path}`"
                data-transfer-drop-target
                role="group"
                @dragenter.prevent="hoveredTarget = `transfer:${dropzone.name}:${dropzone.path}`"
                @dragleave.prevent="leaveTarget($event, `transfer:${dropzone.name}:${dropzone.path}`)"
                @dragover.prevent="hoveredTarget = `transfer:${dropzone.name}:${dropzone.path}`"
                @drop.prevent="dropOnTransfer($event, dropzone)"
              >
                <div class="drop-surface-content min-w-0">
                  <span class="drop-icon mx-auto mb-2 flex size-9 items-center justify-center rounded-md border">
                    <UIcon
                      class="size-5 text-[var(--bitveins-shell-accent)]"
                      name="i-lucide-folder-input"
                    />
                  </span>
                  <p class="truncate text-[length:var(--bitveins-ui-font-size)] font-semibold">
                    {{ dropzone.name }}
                  </p>
                  <p class="mt-1 truncate font-mono text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]">
                    {{ dropzone.path }}
                  </p>
                  <p class="drop-instruction mt-2 text-[length:var(--bitveins-ui-micro-size)] font-medium uppercase tracking-[0.12em]">
                    {{ hoveredTarget === `transfer:${dropzone.name}:${dropzone.path}`
                      ? 'Release to transfer'
                      : 'Drop files here' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div
          v-if="currentPromptAvailable"
          class="drop-surface drop-surface-prompt grid min-h-0 place-items-center overflow-hidden rounded-lg border p-5 text-center"
          aria-label="Current prompt"
          :data-drop-active="hoveredTarget === 'current-prompt'"
          data-current-prompt-drop-target
          role="group"
          @dragenter.prevent="hoveredTarget = 'current-prompt'"
          @dragleave.prevent="leaveTarget($event, 'current-prompt')"
          @dragover.prevent="hoveredTarget = 'current-prompt'"
          @drop.prevent="dropOnCurrentPrompt"
        >
          <div class="drop-surface-content min-w-0">
            <span class="drop-icon mx-auto mb-2 flex size-10 items-center justify-center rounded-md border">
              <UIcon
                class="size-5 text-[var(--bitveins-shell-accent)]"
                name="i-lucide-clipboard-paste"
              />
            </span>
            <p class="text-[length:var(--bitveins-ui-font-size)] font-semibold">
              Current prompt
            </p>
            <p class="mt-1 truncate text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)]">
              {{ currentPromptLabel }}
            </p>
            <p class="drop-instruction mt-2 text-[length:var(--bitveins-ui-micro-size)] font-medium uppercase tracking-[0.12em]">
              {{ hoveredTarget === 'current-prompt'
                ? 'Release to upload and insert'
                : 'Upload and insert without sending' }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-transfer-overlay {
  background:
    radial-gradient(
      circle at 50% 45%,
      color-mix(in srgb, var(--bitveins-shell-accent) 6%, transparent),
      transparent 42%
    ),
    color-mix(in srgb, var(--bitveins-terminal-bg) 74%, transparent);
  -webkit-backdrop-filter: blur(14px) saturate(108%);
  backdrop-filter: blur(14px) saturate(108%);
}

.dropzone-scroll-area {
  scrollbar-color:
    color-mix(in srgb, var(--bitveins-shell-text) 18%, transparent)
    transparent;
}

.drop-surface {
  position: relative;
  isolation: isolate;
  border-color: color-mix(in srgb, var(--bitveins-shell-text) 19%, transparent);
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--bitveins-shell-text) 5%, transparent),
      transparent 38%
    ),
    color-mix(in srgb, var(--bitveins-shell-panel-solid) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--bitveins-shell-text) 9%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--bitveins-shell-text) 3%, transparent),
    0 16px 42px rgb(0 0 0 / 28%);
  -webkit-backdrop-filter: blur(20px) saturate(115%);
  backdrop-filter: blur(20px) saturate(115%);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

.drop-surface::before {
  position: absolute;
  inset: -20%;
  z-index: 0;
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, var(--bitveins-shell-accent) 22%, transparent),
    transparent 58%
  );
  content: "";
  opacity: 0;
  transform: scale(.82);
  transition: opacity 140ms ease, transform 180ms ease;
}

.drop-surface::after {
  position: absolute;
  inset: 5px;
  z-index: 0;
  border: 1px solid color-mix(in srgb, var(--bitveins-shell-text) 6%, transparent);
  border-radius: calc(.5rem - 3px);
  content: "";
  pointer-events: none;
  transition: border-color 140ms ease;
}

.drop-surface-prompt {
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--bitveins-shell-accent) 7%, transparent),
      transparent 48%
    ),
    color-mix(in srgb, var(--bitveins-shell-panel-solid) 72%, transparent);
}

.drop-surface[data-drop-active="true"] {
  border-color: color-mix(in srgb, var(--bitveins-shell-accent) 88%, white 5%);
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--bitveins-shell-accent) 18%, transparent),
      transparent 52%
    ),
    color-mix(in srgb, var(--bitveins-shell-panel-solid) 78%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--bitveins-shell-text) 15%, transparent),
    0 0 0 1px color-mix(in srgb, var(--bitveins-shell-accent) 20%, transparent),
    0 0 34px color-mix(in srgb, var(--bitveins-shell-accent) 16%, transparent),
    0 22px 56px rgb(0 0 0 / 38%);
  transform: translateY(-2px) scale(1.008);
}

.drop-surface[data-drop-active="true"]::before {
  opacity: 1;
  transform: scale(1);
}

.drop-surface[data-drop-active="true"]::after {
  border-color: color-mix(in srgb, var(--bitveins-shell-accent) 24%, transparent);
}

.drop-surface-content {
  position: relative;
  z-index: 1;
}

.drop-icon {
  border-color: color-mix(in srgb, var(--bitveins-shell-accent) 25%, transparent);
  background: color-mix(in srgb, var(--bitveins-shell-accent) 9%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 7%, transparent);
  transition: border-color 140ms ease, background-color 140ms ease, transform 140ms ease;
}

.drop-surface[data-drop-active="true"] .drop-icon {
  border-color: color-mix(in srgb, var(--bitveins-shell-accent) 58%, transparent);
  background: color-mix(in srgb, var(--bitveins-shell-accent) 18%, transparent);
  transform: translateY(-2px);
}

.drop-instruction {
  color: color-mix(in srgb, var(--bitveins-shell-text) 42%, transparent);
  transition: color 140ms ease, letter-spacing 140ms ease;
}

.drop-surface[data-drop-active="true"] .drop-instruction {
  color: var(--bitveins-shell-accent);
  letter-spacing: .15em;
}

@media (prefers-reduced-motion: reduce) {
  .drop-surface,
  .drop-surface::before,
  .drop-surface::after,
  .drop-icon,
  .drop-instruction {
    transition: none;
  }
}
</style>
