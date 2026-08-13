<script setup lang="ts">
import { computed } from 'vue'
import type { GitCommitDetails, GitFileChange } from '#shared/contracts/git'

const props = defineProps<{
  details: GitCommitDetails
  graphGutter: number
  openingPath: string | null
}>()

const emit = defineEmits<{
  openDiff: [file: GitFileChange]
}>()

const statusLabels: Record<GitFileChange['status'], string> = {
  'added': 'A',
  'copied': 'C',
  'deleted': 'D',
  'modified': 'M',
  'renamed': 'R',
  'type-changed': 'T',
  'unknown': '?',
}

const message = computed(() => {
  const full = props.details.commit.body.trim()
  return full || props.details.commit.subject
})
</script>

<template>
  <div
    class="grid min-h-44 grid-cols-1 border-y border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] lg:grid-cols-2"
    data-git-commit-details
  >
    <section
      class="min-w-0 space-y-3 border-b border-[var(--bitveins-shell-border)] p-4 lg:border-b-0 lg:border-r"
      :style="{ paddingLeft: `${Math.max(16, graphGutter)}px` }"
    >
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--bitveins-ui-label-size)]">
        <dt class="font-semibold text-[var(--bitveins-shell-text)]">
          Commit
        </dt>
        <dd
          class="truncate font-mono text-[var(--bitveins-shell-text-muted)]"
          :title="details.commit.hash"
        >
          {{ details.commit.hash }}
        </dd>
        <dt class="font-semibold text-[var(--bitveins-shell-text)]">
          Parents
        </dt>
        <dd class="truncate font-mono text-[var(--bitveins-shell-text-muted)]">
          {{ details.commit.parents.map(parent => parent.slice(0, 8)).join(', ') || 'None' }}
        </dd>
        <dt class="font-semibold text-[var(--bitveins-shell-text)]">
          Author
        </dt>
        <dd class="truncate text-[var(--bitveins-shell-text-muted)]">
          {{ details.commit.authorName }} &lt;{{ details.commit.authorEmail }}&gt;
        </dd>
        <dt class="font-semibold text-[var(--bitveins-shell-text)]">
          Committer
        </dt>
        <dd class="truncate text-[var(--bitveins-shell-text-muted)]">
          {{ details.commit.committerName }} &lt;{{ details.commit.committerEmail }}&gt;
        </dd>
      </dl>
      <p class="whitespace-pre-wrap text-[length:var(--bitveins-ui-font-size)] leading-relaxed text-[var(--bitveins-shell-text)]">
        {{ message }}
      </p>
    </section>

    <section class="min-w-0 p-2">
      <div class="mb-1 flex items-center justify-between px-2 py-1">
        <span class="font-semibold text-[var(--bitveins-shell-text)]">Files</span>
        <span class="text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]">{{ details.files.length }} changed</span>
      </div>
      <div
        v-if="details.files.length"
        class="space-y-0.5"
      >
        <button
          v-for="file in details.files"
          :key="file.path"
          class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--bitveins-shell-panel-muted)] disabled:opacity-60"
          :disabled="openingPath !== null"
          :data-git-file="file.path"
          type="button"
          @click="emit('openDiff', file)"
        >
          <span
            class="w-4 shrink-0 text-center font-mono text-[length:var(--bitveins-ui-caption-size)] font-bold"
            :class="file.status === 'added'
              ? 'text-emerald-500'
              : file.status === 'deleted'
                ? 'text-rose-500'
                : 'text-amber-500'"
          >{{ statusLabels[file.status] }}</span>
          <UIcon
            :name="file.binary ? 'i-lucide-file-question' : 'i-lucide-file-code-2'"
            class="size-3.5 shrink-0 text-[var(--bitveins-shell-text-subtle)]"
          />
          <span
            class="min-w-0 flex-1 truncate text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text)]"
            :title="file.path"
          >
            {{ file.path }}
          </span>
          <UIcon
            v-if="openingPath === file.path"
            name="i-lucide-loader-circle"
            class="size-3.5 shrink-0 animate-spin"
          />
          <span
            v-else-if="!file.binary"
            class="shrink-0 font-mono text-[length:var(--bitveins-ui-caption-size)]"
          >
            <span class="text-emerald-500">+{{ file.additions }}</span>
            <span class="ml-1 text-rose-500">-{{ file.deletions }}</span>
          </span>
          <span
            v-else
            class="text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]"
          >binary</span>
        </button>
      </div>
      <p
        v-else
        class="px-2 py-4 text-[var(--bitveins-shell-text-subtle)]"
      >
        No changed files.
      </p>
    </section>
  </div>
</template>
