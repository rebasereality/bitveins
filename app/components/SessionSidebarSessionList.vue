<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TmuxSession } from '~/types/session'

const props = defineProps<{
  activeSession: string | null
  sessions: TmuxSession[]
  isMobile?: boolean
}>()

const emit = defineEmits<{
  attach: [sessionName: string]
  detach: [sessionName: string]
  destroy: [sessionName: string]
  rename: [session: TmuxSession]
}>()

function actionItems(session: TmuxSession): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Attach',
        icon: 'i-lucide-play',
        onSelect: () => emit('attach', session.name),
      },
      {
        label: 'Detach local PTY',
        icon: 'i-lucide-square',
        disabled: props.activeSession !== session.name,
        onSelect: () => emit('detach', session.name),
      },
      {
        label: 'Rename session',
        icon: 'i-lucide-pencil',
        onSelect: () => emit('rename', session),
      },
    ],
    [
      {
        label: 'Destroy session',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => emit('destroy', session.name),
      },
    ],
  ]
}
</script>

<template>
  <div
    class="flex flex-col"
    data-session-list
  >
    <div
      v-for="session in sessions"
      :key="session.name"
      class="group relative flex items-center"
      :class="isMobile ? 'h-9' : 'h-6'"
      :data-session-active="activeSession === session.name"
    >
      <span
        v-if="activeSession === session.name"
        aria-hidden="true"
        class="absolute inset-y-0 left-0 w-0.5 bg-[var(--bitveins-shell-accent)]"
      />

      <button
        :aria-current="activeSession === session.name ? 'true' : undefined"
        class="h-full min-w-0 flex-1 truncate rounded px-1.5 text-left text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text-muted)] outline-none transition-colors hover:bg-[var(--bitveins-shell-panel-muted)]/70 hover:text-[var(--bitveins-shell-text)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
        :class="activeSession === session.name ? 'font-semibold text-[var(--bitveins-shell-text)]' : ''"
        type="button"
        @click="emit('attach', session.name)"
      >
        {{ session.name }}
      </button>

      <UDropdownMenu
        :items="actionItems(session)"
        :content="{ align: 'end' }"
      >
        <UButton
          :aria-label="`Actions for ${session.name}`"
          class="mr-0.5 size-5 justify-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:size-7 max-lg:opacity-100"
          color="neutral"
          icon="i-lucide-ellipsis"
          size="xs"
          square
          :title="`Actions for ${session.name}`"
          variant="ghost"
        />
      </UDropdownMenu>
    </div>
  </div>
</template>
