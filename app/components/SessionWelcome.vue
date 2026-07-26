<script setup lang="ts">
import { computed } from 'vue'
import type { TmuxSession } from '~/types/session'

const props = defineProps<{
  loading: boolean
  sessions: TmuxSession[]
}>()

const emit = defineEmits<{
  attach: [sessionName: string]
  create: []
}>()

const visibleSessions = computed(() => props.sessions.slice(0, 6))
const hiddenSessionCount = computed(() => Math.max(0, props.sessions.length - visibleSessions.value.length))

function displayPath(path: string): string {
  if (!path) return '~'
  return path.replace(/^\/(?:home\/[^/]+|root)(?=\/|$)/, '~')
}
</script>

<template>
  <section
    aria-label="Session welcome"
    class="flex h-full min-h-0 items-center justify-center overflow-y-auto px-5 py-10 max-sm:items-start max-sm:px-4 max-sm:py-7"
    data-session-welcome
  >
    <div class="w-full max-w-2xl">
      <div class="mb-7 text-center max-sm:mb-5">
        <div class="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] shadow-sm">
          <img
            alt=""
            aria-hidden="true"
            class="size-9 rounded-lg"
            height="36"
            src="/icons/bitveins-hand-64x64.png"
            width="36"
          >
        </div>

        <template v-if="loading">
          <h2 class="text-base font-semibold tracking-[-0.015em] text-[var(--bitveins-shell-text)]">
            Loading your sessions
          </h2>
          <UIcon
            aria-hidden="true"
            class="mx-auto mt-3 size-4 animate-spin text-[var(--bitveins-shell-text-subtle)]"
            name="i-lucide-loader-circle"
          />
        </template>

        <template v-else-if="sessions.length > 0">
          <h2 class="text-base font-semibold tracking-[-0.015em] text-[var(--bitveins-shell-text)]">
            Pick up where you left off
          </h2>
          <p class="mx-auto mt-1 max-w-md text-[length:var(--bitveins-ui-label-size)] leading-relaxed text-[var(--bitveins-shell-text-muted)]">
            Open a tmux session to continue, or start a fresh workspace.
          </p>
        </template>

        <template v-else>
          <h2 class="text-base font-semibold tracking-[-0.015em] text-[var(--bitveins-shell-text)]">
            Start your first workspace
          </h2>
          <p class="mx-auto mt-1 max-w-sm text-[length:var(--bitveins-ui-label-size)] leading-relaxed text-[var(--bitveins-shell-text-muted)]">
            Create a tmux session and keep your terminal ready across devices.
          </p>
        </template>
      </div>

      <template v-if="!loading && sessions.length > 0">
        <div class="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <button
            v-for="session in visibleSessions"
            :key="session.name"
            :aria-label="`Open session ${session.name}`"
            class="group flex min-w-0 items-center gap-3 rounded-lg border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)]/70 p-3 text-left shadow-sm outline-none transition-[border-color,background-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-[var(--bitveins-shell-accent)] hover:bg-[var(--bitveins-shell-panel)] hover:shadow-md focus-visible:border-[var(--bitveins-shell-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bitveins-shell-accent-soft)]"
            data-session-welcome-card
            type="button"
            @click="emit('attach', session.name)"
          >
            <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bitveins-shell-panel-muted)] text-[var(--bitveins-shell-text-muted)] transition-colors group-hover:bg-[var(--bitveins-shell-accent-soft)] group-hover:text-[var(--bitveins-shell-accent)]">
              <UIcon
                aria-hidden="true"
                class="size-4"
                name="i-lucide-terminal"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[length:var(--bitveins-ui-label-size)] font-semibold text-[var(--bitveins-shell-text)]">
                {{ session.name }}
              </span>
              <span
                class="mt-0.5 block truncate font-mono text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]"
                :title="session.path"
              >
                {{ displayPath(session.path) }}
              </span>
            </span>
            <UIcon
              aria-hidden="true"
              class="size-3.5 shrink-0 -translate-x-1 text-[var(--bitveins-shell-text-subtle)] opacity-0 transition-[opacity,transform,color] group-hover:translate-x-0 group-hover:text-[var(--bitveins-shell-accent)] group-hover:opacity-100 max-sm:translate-x-0 max-sm:opacity-100"
              name="i-lucide-arrow-right"
            />
          </button>
        </div>

        <div class="mt-4 flex items-center justify-center gap-3">
          <UButton
            color="neutral"
            icon="i-lucide-plus"
            label="New session"
            size="xs"
            variant="soft"
            @click="emit('create')"
          />
          <span
            v-if="hiddenSessionCount > 0"
            class="text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]"
          >
            {{ hiddenSessionCount }} more in the sidebar
          </span>
        </div>
      </template>

      <div
        v-else-if="!loading"
        class="flex justify-center"
      >
        <UButton
          color="primary"
          icon="i-lucide-plus"
          label="Create your first session"
          size="sm"
          @click="emit('create')"
        />
      </div>
    </div>
  </section>
</template>
