<script setup lang="ts">
import { ref, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  show: boolean
  x: number
  y: number
  items: Array<{
    label: string
    icon?: string
    click: () => void
  }>
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const menuRef = ref<HTMLDivElement | null>(null)

function close() {
  emit('update:show', false)
}

function handleItemClick(itemClick: () => void) {
  itemClick()
  close()
}

// Close on outside clicks and scroll
function handleOutsideClick(event: MouseEvent) {
  if (props.show && menuRef.value && !menuRef.value.contains(event.target as Node)) {
    close()
  }
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    // Add event listeners when visible
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick)
      document.addEventListener('contextmenu', handleOutsideClick)
    }, 10)
  }
  else {
    document.removeEventListener('click', handleOutsideClick)
    document.removeEventListener('contextmenu', handleOutsideClick)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('contextmenu', handleOutsideClick)
})
</script>

<template>
  <div
    v-if="show"
    ref="menuRef"
    class="fixed z-50 min-w-44 select-none rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-solid)] py-1 text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text)] shadow-xl animate-in fade-in zoom-in-95 duration-100"
    :style="{
      top: `${y}px`,
      left: `${x}px`,
    }"
  >
    <button
      v-for="item in items"
      :key="item.label"
      class="group flex h-7 w-full cursor-pointer items-center gap-2 px-2 text-left transition-colors hover:bg-[var(--bitveins-shell-accent-soft)] hover:text-[var(--bitveins-shell-text)] focus:outline-none focus-visible:bg-[var(--bitveins-shell-accent-soft)]"
      type="button"
      @click="handleItemClick(item.click)"
    >
      <UIcon
        v-if="item.icon"
        :name="item.icon"
        class="size-3.5 shrink-0 text-[var(--bitveins-shell-text-subtle)] group-hover:text-[var(--bitveins-shell-accent)]"
      />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>
