<script setup lang="ts">
import { computed } from 'vue'
import type { ExplorerGitDiffDocument } from '~/types/explorer'
import { gitChangedLines } from '~/git/git-line-diff'

const props = defineProps<{ document: ExplorerGitDiffDocument }>()
const changes = computed(() => gitChangedLines(props.document.before || '', props.document.after || ''))
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
      class="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-2 lg:overflow-hidden"
    >
      <section class="flex min-h-64 min-w-0 flex-col border-b border-[var(--bitveins-shell-border)] lg:min-h-0 lg:border-b-0 lg:border-r">
        <div class="flex h-7 shrink-0 items-center justify-between bg-rose-500/8 px-3 text-[length:var(--bitveins-ui-caption-size)]">
          <span class="truncate text-[var(--bitveins-shell-text-muted)]">{{ document.previousPath || document.filePath }}</span>
          <span class="font-semibold text-rose-500">Before</span>
        </div>
        <CodeEditor
          class="min-h-0 flex-1"
          :file-path="document.previousPath || document.filePath"
          highlight-tone="deleted"
          :highlighted-lines="changes.before"
          :model-value="document.before || ''"
          read-only
        />
      </section>
      <section class="flex min-h-64 min-w-0 flex-col lg:min-h-0">
        <div class="flex h-7 shrink-0 items-center justify-between bg-emerald-500/8 px-3 text-[length:var(--bitveins-ui-caption-size)]">
          <span class="truncate text-[var(--bitveins-shell-text-muted)]">{{ document.filePath }}</span>
          <span class="font-semibold text-emerald-500">After</span>
        </div>
        <CodeEditor
          class="min-h-0 flex-1"
          :file-path="document.filePath"
          highlight-tone="added"
          :highlighted-lines="changes.after"
          :model-value="document.after || ''"
          read-only
        />
      </section>
    </div>
  </div>
</template>
