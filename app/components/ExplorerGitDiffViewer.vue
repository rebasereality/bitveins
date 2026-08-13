<script setup lang="ts">
import type { ExplorerGitDiffDocument } from '~/types/explorer'

defineProps<{ document: ExplorerGitDiffDocument }>()
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bitveins-terminal-bg)]"
    data-explorer-git-diff
  >
    <header class="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-3">
      <UIcon
        name="i-lucide-git-compare-arrows"
        class="size-4 text-[var(--bitveins-shell-accent)]"
      />
      <span
        class="min-w-0 flex-1 truncate font-mono text-[length:var(--bitveins-ui-label-size)]"
        :title="document.filePath"
      >{{ document.filePath }}</span>
      <span class="font-mono text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]">{{ document.commit.slice(0, 8) }}</span>
    </header>

    <div
      v-if="document.binary"
      class="grid min-h-0 flex-1 place-items-center p-6 text-center"
    >
      <div class="space-y-2 text-[var(--bitveins-shell-text-muted)]">
        <UIcon
          name="i-lucide-file-question"
          class="mx-auto size-10 text-[var(--bitveins-shell-text-subtle)]"
        />
        <p>Binary file diff is not available.</p>
      </div>
    </div>

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div class="grid shrink-0 grid-cols-2 border-b border-[var(--bitveins-shell-border)]">
        <div class="flex h-7 shrink-0 items-center justify-between bg-rose-500/8 px-3 text-[length:var(--bitveins-ui-caption-size)]">
          <span class="truncate text-[var(--bitveins-shell-text-muted)]">{{ document.previousPath || document.filePath }}</span>
          <span class="font-semibold text-rose-500">Before</span>
        </div>
        <div class="flex h-7 shrink-0 items-center justify-between border-l border-[var(--bitveins-shell-border)] bg-emerald-500/8 px-3 text-[length:var(--bitveins-ui-caption-size)]">
          <span class="truncate text-[var(--bitveins-shell-text-muted)]">{{ document.filePath }}</span>
          <span class="font-semibold text-emerald-500">After</span>
        </div>
      </div>
      <GitDiffMergeEditor
        :after="document.after || ''"
        :before="document.before || ''"
        :file-path="document.filePath"
      />
    </div>
  </div>
</template>
