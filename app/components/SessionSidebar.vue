<script setup lang="ts">
import type { TmuxSession } from '~/types/session'
import { useFileDownloadModal } from '~/composables/useFileDownloadModal'
import { useSessionDropzones } from '~/composables/useSessionDropzones'
import SessionSidebarModals from '~/components/SessionSidebarModals.vue'
import type { TmuxAgent } from '#shared/contracts/agents'

defineProps<{
  activeSession: string | null
  activeAgentPaneId: string | null
  activeWindowId: string | null
  agents: TmuxAgent[]
  agentsError: string | null
  error: string | null
  linuxUsername: string | null
  loading: boolean
  notificationMuteAvailable: boolean
  sessions: TmuxSession[]
  hasNotificationMuteError: (sessionId: string) => boolean
  isNotificationMuteBusy: (sessionId: string) => boolean
  isNotificationMuted: (sessionId: string) => boolean
  unreadAttentionCount: number
}>()

const emit = defineEmits<{
  attach: [sessionName: string]
  create: [payload: { name: string, path: string }]
  destroy: [sessionName: string]
  detach: [sessionName: string]
  logout: []
  inbox: []
  interactionOverlayChange: [open: boolean]
  openAgent: [agent: TmuxAgent]
  refresh: []
  rename: [payload: { currentName: string, nextName: string }]
  renameAgent: [payload: { label: string | null, paneId: string }]
  openDropzone: [payload: { name: string, path: string }]
  settings: []
  toggleNotificationMute: [sessionId: string]
}>()

const drawerOpen = ref(false)
const modalOpen = ref(false)
const renameModalOpen = ref(false)
const renameCurrentName = ref('')

const {
  dropzones,
  dropzoneModalOpen,
  dropzoneUploads,
  fileInput,
  openDropzoneModal,
  createDropzone,
  deleteDropzone,
  triggerFilePicker,
  onFileSelected,
} = useSessionDropzones()

const {
  downloadModalOpen,
  downloadPath,
  downloadError,
  downloadLoading,
  openDownloadModal,
  handleDownloadFile,
} = useFileDownloadModal()

const interactionOverlayOpen = computed(() => (
  drawerOpen.value
  || modalOpen.value
  || renameModalOpen.value
  || dropzoneModalOpen.value
  || downloadModalOpen.value
))

watch(interactionOverlayOpen, open => emit('interactionOverlayChange', open), { immediate: true })

function openModal(): void {
  modalOpen.value = true
}

defineExpose({
  openCreateSession: openModal,
})

function handleCreateSession(payload: { name: string, path: string }): void {
  emit('create', payload)
}

function openRenameModal(session: TmuxSession): void {
  renameCurrentName.value = session.name
  renameModalOpen.value = true
}

function handleRenameSession(payload: { nextName: string }): void {
  emit('rename', {
    currentName: renameCurrentName.value,
    nextName: payload.nextName,
  })
}

const newMenuOptions = [
  [
    { label: 'Create tmux session', icon: 'i-lucide-terminal', onSelect: openModal },
    { label: 'Create transfer destination', icon: 'i-lucide-folder-plus', onSelect: openDropzoneModal },
  ],
]
const moreMenuOptions = [
  [
    { label: 'Refresh sessions', icon: 'i-lucide-refresh-cw', onSelect: () => emit('refresh') },
  ],
]

function afterDrawerClose(action: () => void): void {
  if (!drawerOpen.value) {
    action()
    return
  }

  drawerOpen.value = false
  void nextTick(action)
}

function attachSession(sessionName: string): void {
  afterDrawerClose(() => emit('attach', sessionName))
}

function attachAgent(agent: TmuxAgent): void {
  afterDrawerClose(() => emit('openAgent', agent))
}

function openDropzone(dropzone: { name: string, path: string }): void {
  afterDrawerClose(() => emit('openDropzone', dropzone))
}

function openSettings(): void {
  afterDrawerClose(() => emit('settings'))
}
</script>

<template>
  <aside
    class="relative z-20 flex min-h-0 flex-col border-r border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] text-[var(--bitveins-shell-text)] lg:z-40 max-lg:border-b max-lg:border-r-0"
    data-bitveins-sidebar
  >
    <div
      class="flex h-[var(--bitveins-topbar-height)] shrink-0 items-center justify-between border-b border-[var(--bitveins-shell-border)] px-1 max-lg:h-[calc(40px+env(safe-area-inset-top))] max-lg:items-end max-lg:px-1.5 max-lg:pb-1 max-lg:pt-[env(safe-area-inset-top)]"
      data-sidebar-header
    >
      <div class="flex min-w-0 items-center gap-1">
        <UButton
          aria-label="Open sessions"
          class="lg:hidden max-lg:size-8 max-lg:justify-center"
          color="neutral"
          icon="i-lucide-menu"
          size="xs"
          square
          title="Open sessions"
          variant="ghost"
          @click="drawerOpen = true"
        />
        <img
          alt=""
          aria-hidden="true"
          class="size-6 shrink-0 rounded-[3px]"
          data-sidebar-brand-logo
          height="24"
          src="/icons/bitveins-hand-64x64.png"
          width="24"
        >
        <h1 class="hidden truncate text-[length:var(--bitveins-ui-label-size)] font-semibold lg:block">
          Bitveins
        </h1>
        <p class="min-w-0 truncate text-xs text-[var(--bitveins-shell-text-muted)] lg:hidden">
          {{ activeSession || 'Sessions' }}
        </p>
      </div>

      <div class="flex items-center gap-0.5">
        <UButton
          aria-label="Open Agent Inbox"
          class="relative size-6 justify-center max-lg:size-8"
          color="neutral"
          icon="i-lucide-inbox"
          size="xs"
          square
          title="Agent Inbox"
          variant="ghost"
          @click="emit('inbox')"
        >
          <span
            v-if="unreadAttentionCount > 0"
            class="absolute -right-0.5 -top-0.5 grid min-w-3.5 place-items-center rounded-full bg-[var(--bitveins-shell-accent)] px-0.5 text-[9px] leading-3.5 text-[var(--bitveins-accent-contrast)]"
          >
            {{ Math.min(unreadAttentionCount, 99) }}
          </span>
        </UButton>

        <UDropdownMenu
          :items="newMenuOptions"
          :content="{ align: 'end' }"
        >
          <UButton
            aria-label="New..."
            class="size-6 justify-center max-lg:size-8"
            color="neutral"
            icon="i-lucide-plus"
            size="xs"
            square
            title="New..."
            variant="ghost"
          />
        </UDropdownMenu>

        <UDropdownMenu
          :items="moreMenuOptions"
          :content="{ align: 'end' }"
        >
          <UButton
            aria-label="More sidebar actions"
            class="size-6 justify-center max-lg:size-8"
            color="neutral"
            :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-ellipsis-vertical'"
            size="xs"
            square
            title="More sidebar actions"
            :ui="{ leadingIcon: loading ? 'animate-spin' : '' }"
            variant="ghost"
          />
        </UDropdownMenu>
      </div>
    </div>

    <div
      class="hidden min-h-0 flex-1 flex-col overflow-y-auto px-1 py-1 lg:flex"
      data-sidebar-session-scroll
    >
      <UAlert
        v-if="error"
        class="mb-1 text-[length:var(--bitveins-ui-caption-size)]"
        color="error"
        icon="i-lucide-triangle-alert"
        :title="error"
        variant="subtle"
      />
      <SessionSidebarSessionState
        v-if="sessions.length === 0 && !error"
        :loading="loading"
      />
      <p
        v-if="sessions.length > 0"
        class="px-1.5 pb-1 pt-0.5 text-[length:var(--bitveins-ui-micro-size)] font-medium text-[var(--bitveins-shell-text-subtle)]"
      >
        Sessions
      </p>
      <SessionSidebarSessionList
        :active-agent-pane-id="activeAgentPaneId"
        :active-session="activeSession"
        :active-window-id="activeWindowId"
        :agents="agents"
        :has-notification-mute-error="hasNotificationMuteError"
        :is-notification-mute-busy="isNotificationMuteBusy"
        :is-notification-muted="isNotificationMuted"
        :notification-mute-available="notificationMuteAvailable"
        :sessions="sessions"
        @attach="attachSession"
        @destroy="emit('destroy', $event)"
        @detach="emit('detach', $event)"
        @rename="openRenameModal"
        @open-agent="attachAgent"
        @rename-agent="emit('renameAgent', $event)"
        @toggle-notification-mute="emit('toggleNotificationMute', $event)"
      />
      <p
        v-if="agentsError"
        class="px-1.5 pt-1 text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-agent-failed)]"
        role="status"
      >
        {{ agentsError }}
      </p>
    </div>

    <div
      class="hidden shrink-0 flex-col gap-0.5 border-t border-[var(--bitveins-shell-border)] px-1 py-1 lg:flex"
      data-sidebar-dock
    >
      <SessionSidebarTransfers
        :dropzones="dropzones"
        :dropzone-uploads="dropzoneUploads"
        @create="openDropzoneModal"
        @delete="deleteDropzone"
        @open="openDropzone"
        @pick="triggerFilePicker"
      />
      <SessionSidebarAccountMenu
        :username="linuxUsername"
        @download="openDownloadModal"
        @logout="emit('logout')"
        @settings="openSettings"
      />
    </div>

    <UDrawer
      v-model:open="drawerOpen"
      :close="{
        class: 'size-8 justify-center',
        color: 'neutral',
        icon: 'i-lucide-x',
        size: 'xs',
        square: true,
        variant: 'ghost',
      }"
      description="Browse and manage tmux sessions"
      direction="left"
      :handle="false"
      title="Sessions"
      :ui="{ content: 'bitveins-mobile-sessions-drawer h-dvh w-screen max-w-none bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)]', header: 'min-h-12 border-b border-[var(--bitveins-shell-border)] p-2 pl-3', title: 'text-sm font-semibold text-[var(--bitveins-shell-text)]', body: 'flex min-h-0 flex-1 flex-col p-1.5' }"
    >
      <template #body>
        <div class="flex items-center gap-1 pb-1.5">
          <UDropdownMenu
            class="w-full"
            :items="newMenuOptions"
          >
            <UButton
              block
              color="neutral"
              icon="i-lucide-plus"
              label="New..."
              size="xs"
              variant="subtle"
            />
          </UDropdownMenu>
          <UButton
            aria-label="Refresh sessions"
            color="neutral"
            :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-refresh-cw'"
            size="xs"
            square
            title="Refresh sessions"
            :ui="{ leadingIcon: loading ? 'animate-spin' : '' }"
            variant="ghost"
            @click="emit('refresh')"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <UAlert
            v-if="error"
            class="mb-1 text-[length:var(--bitveins-ui-caption-size)]"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="error"
            variant="subtle"
          />
          <SessionSidebarSessionState
            v-if="sessions.length === 0 && !error"
            is-mobile
            :loading="loading"
          />
          <SessionSidebarSessionList
            :active-agent-pane-id="activeAgentPaneId"
            :active-session="activeSession"
            :active-window-id="activeWindowId"
            :agents="agents"
            :has-notification-mute-error="hasNotificationMuteError"
            :is-notification-mute-busy="isNotificationMuteBusy"
            :is-notification-muted="isNotificationMuted"
            :sessions="sessions"
            is-mobile
            :notification-mute-available="notificationMuteAvailable"
            @attach="attachSession"
            @destroy="emit('destroy', $event)"
            @detach="emit('detach', $event)"
            @rename="openRenameModal"
            @open-agent="attachAgent"
            @rename-agent="emit('renameAgent', $event)"
            @toggle-notification-mute="emit('toggleNotificationMute', $event)"
          />
          <p
            v-if="agentsError"
            class="px-1.5 pt-1 text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-agent-failed)]"
            role="status"
          >
            {{ agentsError }}
          </p>
        </div>

        <div class="mt-auto shrink-0 border-t border-[var(--bitveins-shell-border)] pt-1">
          <SessionSidebarTransfers
            :dropzones="dropzones"
            :dropzone-uploads="dropzoneUploads"
            is-mobile
            @create="openDropzoneModal"
            @delete="deleteDropzone"
            @open="openDropzone"
            @pick="triggerFilePicker"
          />
          <SessionSidebarAccountMenu
            is-mobile
            :username="linuxUsername"
            @download="openDownloadModal"
            @logout="emit('logout')"
            @settings="openSettings"
          />
        </div>
      </template>
    </UDrawer>

    <SessionSidebarModals
      v-model:modal-open="modalOpen"
      v-model:dropzone-modal-open="dropzoneModalOpen"
      v-model:rename-modal-open="renameModalOpen"
      v-model:download-modal-open="downloadModalOpen"
      v-model:download-path="downloadPath"
      :download-error="downloadError"
      :download-loading="downloadLoading"
      :dropzones="dropzones"
      @create-session="handleCreateSession"
      @create-dropzone="createDropzone"
      @rename-session="handleRenameSession"
      @download-file="handleDownloadFile"
    />

    <input
      ref="fileInput"
      class="hidden"
      multiple
      type="file"
      @change="onFileSelected"
    >
  </aside>
</template>
