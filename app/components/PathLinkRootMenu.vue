<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  currentRoot: string | null
  hasAny: boolean
}>()

const emit = defineEmits<{
  change: []
  forgetAll: []
  forgetCurrent: []
}>()

const open = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

function close(): void {
  open.value = false
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function onDocumentPointerdown(event: PointerEvent): void {
  if (event.target instanceof Node && !menuRoot.value?.contains(event.target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('pointerdown', onDocumentPointerdown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerdown)
})
</script>

<template>
  <div
    ref="menuRoot"
    class="relative shrink-0"
  >
    <UButton
      aria-haspopup="menu"
      aria-label="More terminal actions"
      class="size-6 justify-center"
      icon="i-lucide-ellipsis-vertical"
      size="xs"
      color="neutral"
      square
      variant="ghost"
      title="More terminal actions"
      :aria-expanded="open"
      @click="open = !open"
    />
    <div
      v-if="open"
      class="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-1 text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text)] shadow-xl"
      role="menu"
    >
      <p class="px-1.5 py-1 font-semibold">
        Path links
      </p>
      <p class="truncate px-1.5 pb-1.5 font-mono text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-muted)]">
        {{ currentRoot ? `Current: ${currentRoot}` : 'No root remembered for this window' }}
      </p>
      <button
        class="flex h-7 w-full items-center rounded px-1.5 text-left hover:bg-[var(--bitveins-shell-panel-muted)]"
        role="menuitem"
        type="button"
        @click="close(); emit('change')"
      >
        Change root…
      </button>
      <button
        class="flex h-7 w-full items-center rounded px-1.5 text-left hover:bg-[var(--bitveins-shell-panel-muted)] disabled:opacity-40"
        :disabled="!currentRoot"
        role="menuitem"
        type="button"
        @click="close(); emit('forgetCurrent')"
      >
        Forget current root
      </button>
      <button
        class="flex h-7 w-full items-center rounded px-1.5 text-left text-rose-500 hover:bg-[var(--bitveins-shell-panel-muted)] disabled:opacity-40"
        :disabled="!hasAny"
        role="menuitem"
        type="button"
        @click="close(); emit('forgetAll')"
      >
        Forget all roots
      </button>
    </div>
  </div>
</template>
