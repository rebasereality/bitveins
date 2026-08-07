<script setup lang="ts">
import type { AttentionEvent, AttentionEventType } from '#shared/contracts/attention'

const props = defineProps<{
  error: string | null
  dismissingAll: boolean
  events: AttentionEvent[]
  loading: boolean
  open: boolean
}>()

const dialog = useTemplateRef<HTMLElement>('dialog')
let previouslyFocused: HTMLElement | null = null

const emit = defineEmits<{
  'dismiss': [event: AttentionEvent]
  'dismiss-all': []
  'select': [event: AttentionEvent]
  'update:open': [open: boolean]
}>()

const labels: Record<AttentionEventType, string> = {
  completed: 'Completed',
  failed: 'Failed',
  information: 'Information',
  input_required: 'Input required',
  permission_required: 'Permission required',
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function tmuxContext(event: AttentionEvent): string {
  if (!event.sessionName) return 'No linked session'
  if (event.windowName) {
    return `tmux: ${event.sessionName} / ${event.windowName}${event.windowId ? ` (${event.windowId})` : ''}`
  }
  return `tmux: ${event.sessionName}${event.windowId ? ` / ${event.windowId}` : ''}`
}

function close(): void {
  emit('update:open', false)
}

function restoreFocus(): void {
  previouslyFocused?.focus()
  previouslyFocused = null
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )]
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.open, async (open) => {
  if (!open) {
    restoreFocus()
    return
  }
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[aria-label="Close Agent Inbox"]')?.focus()
})

onBeforeUnmount(restoreFocus)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[90] bg-black/35"
      data-agent-inbox-overlay
      @click.self="close"
      @keydown="handleDialogKeydown"
    >
      <aside
        ref="dialog"
        aria-label="Agent Inbox"
        aria-modal="true"
        class="absolute inset-y-0 right-0 flex w-[min(92vw,26rem)] flex-col border-l border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)] shadow-2xl"
        data-agent-inbox
        role="dialog"
        tabindex="-1"
      >
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-[var(--bitveins-shell-border)] px-3">
          <div>
            <h2 class="text-sm font-semibold">
              Agent Inbox
            </h2>
            <p class="text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-muted)]">
              Attention, completions and failures
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              v-if="events.length > 0"
              color="neutral"
              label="Dismiss all"
              :loading="dismissingAll"
              size="xs"
              variant="ghost"
              @click="emit('dismiss-all')"
            />
            <UButton
              aria-label="Close Agent Inbox"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              square
              variant="ghost"
              @click="close"
            />
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <UAlert
            v-if="error"
            color="error"
            :title="error"
            variant="subtle"
          />
          <p
            v-else-if="loading && events.length === 0"
            class="p-4 text-center text-xs text-[var(--bitveins-shell-text-muted)]"
          >
            Loading inbox…
          </p>
          <p
            v-else-if="events.length === 0"
            class="p-4 text-center text-xs text-[var(--bitveins-shell-text-muted)]"
          >
            No events yet.
          </p>

          <article
            v-for="event in events"
            :key="event.id"
            class="mb-1.5 rounded border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] p-2.5 transition-colors hover:bg-[var(--bitveins-shell-panel-muted)]"
            :class="{ 'opacity-60': event.dismissedAt, 'border-l-2 border-l-[var(--bitveins-shell-accent)]': !event.readAt && !event.dismissedAt }"
            :data-event-id="event.id"
          >
            <button
              class="block w-full text-left"
              type="button"
              @click="emit('select', event)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">
                    {{ event.title }}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-[var(--bitveins-shell-text-muted)]">
                    {{ [event.project, event.source].filter(Boolean).join(' / ') }}
                  </p>
                </div>
                <span class="shrink-0 rounded border border-[var(--bitveins-shell-border)] px-1.5 py-0.5 text-[10px] text-[var(--bitveins-shell-text-muted)]">
                  {{ labels[event.type] }}
                </span>
              </div>
              <p
                v-if="event.summary"
                class="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]"
              >
                {{ event.summary }}
              </p>
              <div class="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--bitveins-shell-text-subtle)]">
                <span class="truncate">
                  {{ tmuxContext(event) }}
                </span>
                <span class="shrink-0">{{ timestamp(event.createdAt) }}</span>
              </div>
            </button>
            <div class="mt-2 flex items-center justify-between">
              <span class="text-[10px] text-[var(--bitveins-shell-text-subtle)]">
                {{ event.dismissedAt ? 'Dismissed' : event.readAt ? 'Read' : 'Unread' }}
              </span>
              <UButton
                v-if="!event.dismissedAt"
                color="neutral"
                label="Dismiss"
                size="xs"
                variant="ghost"
                @click="emit('dismiss', event)"
              />
            </div>
          </article>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
