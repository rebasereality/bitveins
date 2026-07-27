<script setup lang="ts">
import type { TmuxSession } from '~/types/session'
import { useFileDownloadModal } from '~/composables/useFileDownloadModal'
import { useSessionDropzones } from '~/composables/useSessionDropzones'
import SessionSidebarModals from '~/components/SessionSidebarModals.vue'

defineProps<{
  activeSession: string | null
  error: string | null
  linuxUsername: string | null
  loading: boolean
  sessions: TmuxSession[]
}>()

const emit = defineEmits<{
  attach: [sessionName: string]
  create: [payload: { name: string, path: string }]
  destroy: [sessionName: string]
  detach: [sessionName: string]
  logout: []
  refresh: []
  rename: [payload: { currentName: string, nextName: string }]
  openDropzone: [payload: { name: string, path: string }]
  settings: []
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

function attachSession(sessionName: string): void {
  emit('attach', sessionName)
  drawerOpen.value = false
}

function openDropzone(dropzone: { name: string, path: string }): void {
  emit('openDropzone', dropzone)
  drawerOpen.value = false
}

function openSettings(): void {
  drawerOpen.value = false
  emit('settings')
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
        :active-session="activeSession"
        :sessions="sessions"
        @attach="attachSession"
        @destroy="emit('destroy', $event)"
        @detach="emit('detach', $event)"
        @rename="openRenameModal"
      />
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
      direction="left"
      title="Sessions"
      :ui="{ content: 'bitveins-mobile-sessions-drawer h-dvh w-[min(88vw,22rem)] max-w-none bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)]', header: 'border-b border-[var(--bitveins-shell-border)] p-2', title: 'text-xs font-semibold text-[var(--bitveins-shell-text)]', body: 'flex min-h-0 flex-1 flex-col p-1.5' }"
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
            :active-session="activeSession"
            :sessions="sessions"
            is-mobile
            @attach="attachSession"
            @destroy="emit('destroy', $event)"
            @detach="emit('detach', $event)"
            @rename="openRenameModal"
          />
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
