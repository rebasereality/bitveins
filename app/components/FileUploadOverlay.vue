<script setup lang="ts">
const { dismissError, state } = useFileUploadOverlay()

const isImage = computed(() => {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(state.fileName)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="state.isUploading"
        aria-live="polite"
        class="fixed inset-0 z-[100] flex select-none items-center justify-center bg-black/65 p-4 backdrop-blur-md"
        role="dialog"
      >
        <div class="relative w-full max-w-md overflow-hidden rounded-lg border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-5 text-[var(--bitveins-shell-text)] shadow-2xl shadow-black/50">
          <!-- Ambient glowing background effect -->
          <div class="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-[var(--bitveins-shell-accent-soft)] blur-3xl" />

          <!-- Normal / Uploading / Success Content -->
          <template v-if="state.uploadStatus !== 'error'">
            <div class="relative z-10 space-y-4">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div
                    class="relative flex size-10 shrink-0 items-center justify-center rounded-md border"
                    :class="state.uploadStatus === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                      : 'border-[var(--bitveins-shell-accent)]/30 bg-[var(--bitveins-shell-accent-soft)] text-[var(--bitveins-shell-accent)]'"
                  >
                    <UIcon
                      v-if="state.uploadStatus === 'success'"
                      class="size-5 animate-bounce"
                      name="i-lucide-check-circle-2"
                    />
                    <UIcon
                      v-else-if="isImage"
                      class="size-5"
                      name="i-lucide-image"
                    />
                    <UIcon
                      v-else
                      class="size-5"
                      name="i-lucide-file-up"
                    />
                  </div>

                  <div>
                    <h3 class="text-sm font-semibold text-[var(--bitveins-shell-text)]">
                      {{ state.uploadStatus === 'success' ? state.successTitle : state.uploadingTitle }}
                    </h3>
                    <p class="text-xs text-slate-400">
                      {{ state.uploadStatus === 'success' ? state.successSubtitle : state.uploadingSubtitle }}
                    </p>
                  </div>
                </div>

                <div class="text-right">
                  <span
                    class="font-mono text-lg font-bold"
                    :class="state.uploadStatus === 'success' ? 'text-emerald-400' : 'text-[var(--bitveins-shell-accent)]'"
                  >
                    {{ state.progress }}%
                  </span>
                </div>
              </div>

              <!-- File Info Box -->
              <div class="flex items-center justify-between gap-2 rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-muted)] px-3 py-2 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon
                    class="size-4 shrink-0 text-slate-400"
                    name="i-lucide-file-text"
                  />
                  <span
                    class="truncate font-mono font-medium text-[var(--bitveins-shell-text)]"
                    :title="state.fileName"
                  >
                    {{ state.fileName }}
                  </span>
                </div>
                <span class="shrink-0 font-mono text-[11px] text-slate-400">
                  {{ state.fileSizeFormatted }}
                </span>
              </div>

              <!-- Progress Bar -->
              <div class="space-y-1.5">
                <div
                  :aria-valuenow="state.progress"
                  aria-valuemax="100"
                  aria-valuemin="0"
                  class="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bitveins-shell-border)]"
                  data-upload-progress
                  role="progressbar"
                >
                  <div
                    class="h-full rounded-full transition-all duration-150 ease-out"
                    :class="state.uploadStatus === 'success' ? 'bg-emerald-500' : 'bg-[var(--bitveins-shell-accent)]'"
                    :style="{ width: `${state.progress}%` }"
                  />
                </div>
              </div>

              <!-- Target Path Badge -->
              <div class="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                <UIcon
                  class="size-3.5 shrink-0 text-[var(--bitveins-shell-accent)]"
                  name="i-lucide-folder-output"
                />
                <span>Target:</span>
                <code
                  class="truncate rounded border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-muted)] px-1.5 py-0.5 font-mono text-[var(--bitveins-shell-accent-strong)]"
                  :title="state.destinationPath"
                >
                  {{ state.destinationPath }}
                </code>
              </div>
            </div>
          </template>

          <!-- Error State -->
          <template v-else>
            <div class="relative z-10 space-y-4">
              <div class="flex items-center gap-3">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <UIcon
                    class="size-5"
                    name="i-lucide-alert-triangle"
                  />
                </div>

                <div>
                  <h3 class="text-sm font-semibold text-rose-300">
                    {{ state.errorTitle }}
                  </h3>
                  <p class="text-xs text-slate-400">
                    {{ state.errorSubtitle }}
                  </p>
                </div>
              </div>

              <div class="rounded-lg border border-rose-950/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                {{ state.errorMessage }}
              </div>

              <div class="flex justify-end pt-1">
                <UButton
                  color="neutral"
                  icon="i-lucide-x"
                  label="Dismiss"
                  size="sm"
                  variant="subtle"
                  @click="dismissError"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
