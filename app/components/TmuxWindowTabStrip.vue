<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { TmuxWindowTabItem } from '~/types/tmux-tabs'

const props = defineProps<{
  activeValue?: string
  editingWindowIndex: number | null
  items: TmuxWindowTabItem[]
  windowCount: number
}>()

const emit = defineEmits<{
  cancelRename: []
  close: [index: number]
  commitRename: []
  create: []
  select: [value: string]
  startRename: [index: number]
}>()

const editingWindowName = defineModel<string>('editingWindowName', { default: '' })
const tabList = ref<HTMLElement | null>(null)

async function revealActiveTab(): Promise<void> {
  await nextTick()
  const activeTab = tabList.value?.querySelector<HTMLElement>('[aria-selected="true"]')
  activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

async function focusRenameInput(): Promise<void> {
  await nextTick()
  const input = tabList.value?.querySelector<HTMLInputElement>('[data-window-rename]')
  input?.focus()
  input?.select()
}

watch(() => props.activeValue, revealActiveTab)
watch(() => props.editingWindowIndex, index => index === null ? undefined : focusRenameInput())
</script>

<template>
  <div
    ref="tabList"
    aria-label="Tmux windows"
    class="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden"
    role="tablist"
  >
    <div
      v-for="(item, itemIndex) in items"
      :key="item.value"
      class="group relative flex h-8 max-w-44 shrink-0 items-center border-t border-transparent"
      :class="activeValue === item.value
        ? 'z-10 rounded-t-md border-x border-[var(--bitveins-shell-border)] border-t-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-bg)] text-[var(--bitveins-shell-text)]'
        : 'text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)]/65 hover:text-[var(--bitveins-shell-text)]'"
      :data-window-index="item.windowIndex"
    >
      <span
        v-if="itemIndex > 0 && activeValue !== item.value && activeValue !== items[itemIndex - 1]?.value"
        aria-hidden="true"
        class="absolute left-0 top-2 h-4 border-l border-[var(--bitveins-shell-border)]"
      />

      <input
        v-if="editingWindowIndex === item.windowIndex"
        v-model="editingWindowName"
        :aria-label="`Rename tmux window ${item.windowIndex}`"
        class="mx-1.5 h-5 w-24 min-w-0 rounded border border-[var(--bitveins-shell-accent)] bg-[var(--bitveins-terminal-bg)] px-1 text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text)] outline-none ring-1 ring-[var(--bitveins-shell-accent-soft)]"
        data-window-rename
        maxlength="80"
        @blur="emit('commitRename')"
        @keydown.enter.stop.prevent="emit('commitRename')"
        @keydown.esc.stop.prevent="emit('cancelRename')"
      >

      <button
        v-else
        :aria-label="`Tmux window ${item.windowIndex}: ${item.name}`"
        :aria-selected="activeValue === item.value"
        class="min-w-0 flex-1 truncate py-1.5 pl-2 text-left text-[length:var(--bitveins-ui-label-size)] font-medium outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
        :class="windowCount > 1 ? 'pr-6' : 'pr-2'"
        role="tab"
        :title="`${item.windowIndex}:${item.name} — ${item.title}`"
        type="button"
        @click="emit('select', item.value)"
        @dblclick.stop.prevent="emit('startRename', item.windowIndex)"
      >
        {{ item.label }}
      </button>

      <button
        v-if="windowCount > 1 && editingWindowIndex !== item.windowIndex"
        :aria-label="`Close tmux window ${item.windowIndex}: ${item.name}`"
        class="absolute right-1 grid size-5 place-items-center rounded text-[var(--bitveins-shell-text-subtle)] opacity-70 outline-none hover:bg-black/10 hover:text-[var(--bitveins-shell-text)] focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[var(--bitveins-shell-accent)] dark:hover:bg-white/10 lg:opacity-0 lg:group-hover:opacity-100"
        :title="`Close ${item.name}`"
        type="button"
        @click.stop="emit('close', item.windowIndex)"
      >
        <UIcon
          class="size-3"
          name="i-lucide-x"
        />
      </button>
    </div>

    <button
      aria-label="New tmux window"
      class="grid h-8 w-7 shrink-0 place-items-center text-[var(--bitveins-shell-text-subtle)] outline-none hover:text-[var(--bitveins-shell-text)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
      title="New tmux window"
      type="button"
      @click="emit('create')"
    >
      <UIcon
        class="size-3.5"
        name="i-lucide-plus"
      />
    </button>
  </div>
</template>
