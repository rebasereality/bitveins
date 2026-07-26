<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  isMobile?: boolean
  username: string | null
}>()

const emit = defineEmits<{
  download: []
  logout: []
  settings: []
}>()

const open = ref(false)
const helpOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
const displayName = computed(() => props.username || 'User')
const initial = computed(() => displayName.value.slice(0, 1).toUpperCase())

function close(): void {
  open.value = false
  helpOpen.value = false
}

function toggle(): void {
  if (open.value) {
    close()
    return
  }

  open.value = true
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
    class="relative"
    data-sidebar-account
  >
    <button
      aria-haspopup="menu"
      :aria-expanded="open"
      class="flex w-full items-center gap-2 rounded px-1.5 text-left text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text)] outline-none transition-colors hover:bg-[var(--bitveins-shell-panel-muted)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
      :class="isMobile ? 'h-10' : 'h-8'"
      type="button"
      @click="toggle"
    >
      <span class="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--bitveins-shell-accent-soft)] text-[length:var(--bitveins-ui-caption-size)] font-semibold text-[var(--bitveins-shell-accent-strong)]">
        {{ initial }}
      </span>
      <span class="min-w-0 flex-1 truncate font-medium">{{ displayName }}</span>
      <UIcon
        class="size-3 shrink-0 text-[var(--bitveins-shell-text-subtle)]"
        :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
      />
    </button>

    <div
      v-if="open"
      class="absolute bottom-full left-0 z-[60] mb-1 w-[min(220px,calc(100vw-16px))] rounded-md border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-1 shadow-xl shadow-black/25"
      role="menu"
    >
      <div class="flex items-center gap-2 px-1.5 py-1.5">
        <span class="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--bitveins-shell-accent-soft)] text-[length:var(--bitveins-ui-caption-size)] font-semibold text-[var(--bitveins-shell-accent-strong)]">
          {{ initial }}
        </span>
        <span class="min-w-0">
          <span class="block truncate text-[length:var(--bitveins-ui-label-size)] font-semibold text-[var(--bitveins-shell-text)]">{{ displayName }}</span>
          <span class="block text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]">Linux user</span>
        </span>
      </div>

      <button
        class="flex h-7 w-full items-center gap-2 rounded px-1.5 text-left text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]"
        role="menuitem"
        type="button"
        @click="close(); emit('settings')"
      >
        <UIcon
          class="size-3.5"
          name="i-lucide-settings"
        />
        <span>Settings</span>
      </button>

      <button
        class="flex h-7 w-full items-center gap-2 rounded px-1.5 text-left text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]"
        role="menuitem"
        type="button"
        @click="close(); emit('download')"
      >
        <UIcon
          class="size-3.5"
          name="i-lucide-download"
        />
        <span>Download file</span>
      </button>

      <button
        aria-haspopup="menu"
        :aria-expanded="helpOpen"
        class="flex h-7 w-full items-center gap-2 rounded px-1.5 text-left text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]"
        role="menuitem"
        type="button"
        @click="helpOpen = !helpOpen"
      >
        <UIcon
          class="size-3.5"
          name="i-lucide-circle-help"
        />
        <span class="flex-1">Help</span>
        <UIcon
          class="size-3 text-[var(--bitveins-shell-text-subtle)]"
          :name="helpOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        />
      </button>

      <div
        v-if="helpOpen"
        aria-label="Help"
        class="ml-3 border-l border-[var(--bitveins-shell-border)] pl-1"
        role="menu"
      >
        <a
          class="flex h-7 items-center gap-2 rounded px-1.5 text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]"
          href="https://rebasereality.com/bitveins"
          rel="noopener noreferrer"
          role="menuitem"
          target="_blank"
          @click="close"
        >
          <UIcon
            class="size-3.5"
            name="i-lucide-book-open"
          />
          <span class="flex-1">Documentation</span>
          <UIcon
            aria-hidden="true"
            class="size-3 text-[var(--bitveins-shell-text-subtle)]"
            name="i-lucide-external-link"
          />
        </a>

        <a
          class="flex h-7 items-center gap-2 rounded px-1.5 text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]"
          href="https://github.com/rebasereality/bitveins"
          rel="noopener noreferrer"
          role="menuitem"
          target="_blank"
          @click="close"
        >
          <UIcon
            class="size-3.5"
            name="i-lucide-github"
          />
          <span class="flex-1">GitHub</span>
          <UIcon
            aria-hidden="true"
            class="size-3 text-[var(--bitveins-shell-text-subtle)]"
            name="i-lucide-external-link"
          />
        </a>
      </div>

      <div class="my-1 border-t border-[var(--bitveins-shell-border)]" />

      <button
        class="flex h-7 w-full items-center gap-2 rounded px-1.5 text-left text-[length:var(--bitveins-ui-caption-size)] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
        role="menuitem"
        type="button"
        @click="close(); emit('logout')"
      >
        <UIcon
          class="size-3.5"
          name="i-lucide-log-out"
        />
        <span>Logout</span>
      </button>
    </div>
  </div>
</template>
