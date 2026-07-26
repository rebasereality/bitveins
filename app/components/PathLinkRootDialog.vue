<script setup lang="ts">
defineProps<{
  roots: string[] | null
}>()

const emit = defineEmits<{
  close: []
  select: [root: string]
}>()
</script>

<template>
  <div
    v-if="roots"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="path-root-title"
    @click.self="emit('close')"
  >
    <section class="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-4 text-[var(--bitveins-shell-text)] shadow-2xl">
      <h2
        id="path-root-title"
        class="text-base font-semibold"
      >
        Path link root
      </h2>
      <p class="mt-1 text-sm text-[var(--bitveins-shell-text-muted)]">
        Choose a project root for relative terminal paths in this tmux window.
      </p>
      <div class="mt-4 grid gap-2">
        <button
          v-for="root in roots"
          :key="root"
          class="rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-muted)] px-3 py-2 text-left font-mono text-sm hover:border-[var(--bitveins-shell-accent)] hover:bg-[var(--bitveins-shell-accent-soft)]"
          type="button"
          @click="emit('select', root)"
        >
          {{ root }}
        </button>
        <p
          v-if="roots.length === 0"
          class="text-sm text-[var(--bitveins-shell-text-muted)]"
        >
          No project roots were found inside this session workspace.
        </p>
      </div>
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
