<script setup lang="ts">
import type { Dropzone } from '~/composables/useSessionDropzones'

defineProps<{
  activePickerDropzone?: Dropzone | null
  downloadError: string | null
  downloadLoading: boolean
  dropzones: Dropzone[]
}>()

const emit = defineEmits<{
  createSession: [payload: { name: string, path: string }]
  createDropzone: [payload: { name: string, path: string }]
  renameSession: [payload: { nextName: string }]
  downloadFile: [path: string]
  fileSelected: [event: Event]
}>()

const modalOpen = defineModel<boolean>('modalOpen', { default: false })
const dropzoneModalOpen = defineModel<boolean>('dropzoneModalOpen', { default: false })
const renameModalOpen = defineModel<boolean>('renameModalOpen', { default: false })
const downloadModalOpen = defineModel<boolean>('downloadModalOpen', { default: false })
const downloadPath = defineModel<string>('downloadPath', { default: '' })

const name = ref('')
const path = ref('')
const dropzoneName = ref('')
const dropzonePath = ref('')
const renameNextName = ref('')

function handleCreateSession(): void {
  emit('createSession', {
    name: name.value,
    path: path.value || '~',
  })
  modalOpen.value = false
  name.value = ''
  path.value = ''
}

function handleCreateDropzone(): void {
  emit('createDropzone', {
    name: dropzoneName.value,
    path: dropzonePath.value || '~',
  })
  dropzoneModalOpen.value = false
  dropzoneName.value = ''
  dropzonePath.value = ''
}

function handleRenameSession(): void {
  emit('renameSession', {
    nextName: renameNextName.value,
  })
  renameModalOpen.value = false
  renameNextName.value = ''
}

function handleDownload(): void {
  emit('downloadFile', downloadPath.value)
}
</script>

<template>
  <div>
    <UModal
      v-model:open="modalOpen"
      title="New tmux session"
      :ui="{ content: 'bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)]' }"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="handleCreateSession"
        >
          <UFormField label="Session name">
            <UInput
              v-model="name"
              autocomplete="off"
              class="w-full"
              pattern="[A-Za-z0-9_.:-]{1,80}"
              required
            />
          </UFormField>

          <UFormField label="Target path">
            <UInput
              v-model="path"
              autocomplete="off"
              class="w-full"
              placeholder="~"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-1">
            <UButton
              color="neutral"
              label="Cancel"
              type="button"
              variant="ghost"
              @click="modalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-plus"
              label="Create"
              type="submit"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="dropzoneModalOpen"
      title="New transfer destination"
      :ui="{ content: 'bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)]' }"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="handleCreateDropzone"
        >
          <UFormField label="Destination name">
            <UInput
              v-model="dropzoneName"
              autocomplete="off"
              class="w-full"
              pattern="[A-Za-z0-9_.: -]{1,80}"
              required
            />
          </UFormField>

          <UFormField label="Target path">
            <UInput
              v-model="dropzonePath"
              autocomplete="off"
              class="w-full"
              placeholder="~"
              required
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-1">
            <UButton
              color="neutral"
              label="Cancel"
              type="button"
              variant="ghost"
              @click="dropzoneModalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-plus"
              label="Create"
              type="submit"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="renameModalOpen"
      title="Rename tmux session"
      :ui="{ content: 'bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)]' }"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="handleRenameSession"
        >
          <UFormField label="Session name">
            <UInput
              v-model="renameNextName"
              autocomplete="off"
              autofocus
              class="w-full"
              pattern="[A-Za-z0-9_.:-]{1,80}"
              required
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-1">
            <UButton
              color="neutral"
              label="Cancel"
              type="button"
              variant="ghost"
              @click="renameModalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-pencil"
              label="Rename"
              type="submit"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="downloadModalOpen"
      title="Download file or folder from VM"
      :ui="{ content: 'bg-[var(--bitveins-shell-panel-solid)] text-[var(--bitveins-shell-text)]' }"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="handleDownload"
        >
          <UAlert
            v-if="downloadError"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="downloadError"
            variant="subtle"
            class="mb-2"
          />

          <UFormField label="Path on VM (file or folder)">
            <UInput
              v-model="downloadPath"
              autocomplete="off"
              class="w-full"
              placeholder="e.g. ~/file.txt, /tmp/image.png, or ~/my-folder"
              required
              autofocus
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-1">
            <UButton
              color="neutral"
              label="Cancel"
              type="button"
              variant="ghost"
              @click="downloadModalOpen = false"
            />
            <UButton
              color="primary"
              :icon="downloadLoading ? 'i-lucide-loader-circle' : 'i-lucide-download'"
              label="Download"
              type="submit"
              :loading="downloadLoading"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
