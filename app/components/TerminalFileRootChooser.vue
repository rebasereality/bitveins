<script setup lang="ts">
import type {
  ResolvedExplorerDocument,
  TerminalFileResolution,
} from '#shared/contracts/explorer'
import { ref, watch } from 'vue'

type AmbiguousResolution = Extract<TerminalFileResolution, { status: 'ambiguous' }>

const props = defineProps<{
  resolution: AmbiguousResolution | null
}>()

const emit = defineEmits<{
  close: []
  select: [payload: { document: ResolvedExplorerDocument, remember: boolean }]
}>()

const remember = ref(false)

watch(() => props.resolution, () => {
  remember.value = false
})
</script>

<template>
  <div
    v-if="resolution"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="file-root-title"
    @click.self="emit('close')"
  >
    <section class="max-h-[80vh] w-full max-w-xl overflow-auto rounded-lg border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-4 text-[var(--bitveins-shell-text)] shadow-2xl">
      <h2
        id="file-root-title"
        class="text-base font-semibold"
      >
        Choose the project root
      </h2>
      <p class="mt-1 text-sm text-[var(--bitveins-shell-text-muted)]">
        <code>{{ resolution.reference.path }}</code> exists in several projects.
      </p>

      <div class="mt-4 grid gap-2">
        <button
          v-for="candidate in resolution.candidates"
          :key="`${candidate.root}:${candidate.path}`"
          class="rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-muted)] p-3 text-left transition-colors hover:border-[var(--bitveins-shell-accent)] hover:bg-[var(--bitveins-shell-accent-soft)]"
          type="button"
          @click="emit('select', { document: candidate, remember })"
        >
          <span class="block font-mono text-sm">{{ candidate.path }}</span>
          <span class="mt-1 block text-xs text-[var(--bitveins-shell-text-muted)]">
            Root: {{ candidate.root }}
          </span>
          <span class="mt-0.5 block truncate font-mono text-[11px] text-[var(--bitveins-shell-text-subtle)]">
            {{ candidate.absolutePath }}
          </span>
        </button>
      </div>

      <label class="mt-4 flex cursor-pointer items-center gap-2 text-sm">
        <input
          v-model="remember"
          type="checkbox"
        >
        Remember this root for this tmux window
      </label>

      <div class="mt-4 flex justify-end">
        <UButton
          color="neutral"
          variant="subtle"
          label="Cancel"
          @click="emit('close')"
        />
      </div>
    </section>
  </div>
</template>
