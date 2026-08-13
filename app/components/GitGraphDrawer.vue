<script setup lang="ts">
import type {
  GitCommitDetails,
  GitFileChange,
  GitFileDiff,
  GitGraphResponse,
} from '#shared/contracts/git'
import { layoutGitGraph } from '~/git/git-graph-layout'
import { gitGraphWidth } from '~/git/git-graph-metrics'
import { apiErrorMessage } from '~/utils/api-error'

const props = defineProps<{
  activeSession: string | null
  activeWindowId: string | null
}>()
const emit = defineEmits<{ openDiff: [diff: GitFileDiff] }>()
const open = defineModel<boolean>('open', { default: false })

const PAGE_SIZE = 80
const MIN_WIDTH = 460
const DEFAULT_WIDTH = 860
const STORAGE_KEY = 'bitveins.gitDrawerWidth'

const graph = ref<GitGraphResponse | null>(null)
const details = shallowReactive(new Map<string, GitCommitDetails>())
const selectedHash = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const loadingDetails = ref<string | null>(null)
const openingPath = ref<string | null>(null)
const error = ref<string | null>(null)
const width = ref(DEFAULT_WIDTH)
let requestToken = 0

const rows = computed(() => layoutGitGraph(graph.value?.commits || []))
const graphWidth = computed(() => gitGraphWidth(Math.max(1, ...rows.value.map(row => row.laneCount))))
const windowQuery = computed(() => props.activeWindowId ? { windowId: props.activeWindowId } : {})

function clampWidth(value: number): number {
  return Math.round(Math.min(Math.max(MIN_WIDTH, value), Math.max(MIN_WIDTH, window.innerWidth - 8)))
}

async function load(reset = false): Promise<void> {
  if (!props.activeSession) return
  const token = reset ? ++requestToken : requestToken
  const target = reset ? loading : loadingMore
  target.value = true
  error.value = null
  if (reset) {
    graph.value = null
    selectedHash.value = null
    details.clear()
  }
  try {
    const offset = reset ? 0 : graph.value?.commits.length || 0
    const response = await $fetch<GitGraphResponse>(
      `/api/sessions/${encodeURIComponent(props.activeSession)}/git`,
      { query: { ...windowQuery.value, limit: PAGE_SIZE, offset } },
    )
    if (token !== requestToken) return
    graph.value = reset || !graph.value
      ? response
      : { ...response, commits: [...graph.value.commits, ...response.commits] }
  }
  catch (cause: unknown) {
    if (token === requestToken) error.value = apiErrorMessage(cause, 'Unable to load Git history.')
  }
  finally {
    if (token === requestToken) target.value = false
  }
}

async function toggleCommit(hash: string): Promise<void> {
  if (selectedHash.value === hash) {
    selectedHash.value = null
    return
  }
  selectedHash.value = hash
  if (details.has(hash) || !props.activeSession) return
  loadingDetails.value = hash
  error.value = null
  try {
    details.set(hash, await $fetch<GitCommitDetails>(
      `/api/sessions/${encodeURIComponent(props.activeSession)}/git/commits/${hash}`,
      { query: windowQuery.value },
    ))
  }
  catch (cause: unknown) {
    error.value = apiErrorMessage(cause, 'Unable to load commit details.')
  }
  finally {
    if (loadingDetails.value === hash) loadingDetails.value = null
  }
}

async function openFileDiff(commit: string, file: GitFileChange): Promise<void> {
  if (!props.activeSession) return
  openingPath.value = file.path
  error.value = null
  try {
    const diff = await $fetch<GitFileDiff>(
      `/api/sessions/${encodeURIComponent(props.activeSession)}/git/diff`,
      { query: { ...windowQuery.value, commit, path: file.path } },
    )
    emit('openDiff', diff)
  }
  catch (cause: unknown) {
    error.value = apiErrorMessage(cause, 'Unable to open file diff.')
  }
  finally {
    openingPath.value = null
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function beginResize(event: PointerEvent): void {
  if (event.pointerType === 'touch') return
  const startX = event.clientX
  const startWidth = width.value
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const move = (moveEvent: PointerEvent) => {
    width.value = clampWidth(startWidth + startX - moveEvent.clientX)
  }
  const finish = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', finish)
    target.removeEventListener('pointercancel', finish)
    window.localStorage.setItem(STORAGE_KEY, String(width.value))
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', finish)
  target.addEventListener('pointercancel', finish)
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  width.value = clampWidth(width.value + (event.key === 'ArrowLeft' ? 24 : -24))
  window.localStorage.setItem(STORAGE_KEY, String(width.value))
}

watch([open, () => props.activeSession, () => props.activeWindowId], ([isOpen]) => {
  if (isOpen) void load(true)
  else requestToken += 1
})

watch(width, value => document.documentElement.style.setProperty('--bitveins-git-drawer-width', `${value}px`))

onMounted(() => {
  const stored = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) || '', 10)
  width.value = clampWidth(Number.isFinite(stored) ? stored : DEFAULT_WIDTH)
  document.documentElement.style.setProperty('--bitveins-git-drawer-width', `${width.value}px`)
})
</script>

<template>
  <USlideover
    v-model:open="open"
    class="bitveins-git-drawer border-l border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-bg)] text-[var(--bitveins-shell-text)]"
    description="Read-only commit history and changed files"
    :ui="{
      body: 'min-h-0 flex-1 overflow-y-auto p-0 sm:p-0',
      header: 'min-h-12 border-b border-[var(--bitveins-shell-border)] px-3 py-2 sm:px-3',
      overlay: 'bg-black/45 backdrop-blur-[1px]',
    }"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <UIcon
          name="i-lucide-git-branch"
          class="size-4 shrink-0 text-[var(--bitveins-shell-accent)]"
        />
        <div class="min-w-0">
          <h2 class="truncate font-semibold">
            {{ graph?.repository || 'Git Graph' }}
          </h2>
          <p
            v-if="graph"
            class="truncate text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]"
          >
            {{ graph.detached ? 'Detached at' : 'Branch' }} {{ graph.branch }}
          </p>
        </div>
      </div>
      <UButton
        aria-label="Refresh Git graph"
        color="neutral"
        icon="i-lucide-refresh-cw"
        size="xs"
        square
        variant="ghost"
        @click="load(true)"
      />
      <UButton
        aria-label="Close Git graph"
        color="neutral"
        icon="i-lucide-x"
        size="xs"
        square
        variant="ghost"
        @click="open = false"
      />
    </template>

    <template #body>
      <div
        aria-label="Resize Git graph"
        aria-orientation="vertical"
        class="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize items-center justify-center outline-none after:h-12 after:w-0.5 after:rounded after:bg-[var(--bitveins-shell-border-strong)] hover:after:bg-[var(--bitveins-shell-accent)] focus-visible:after:bg-[var(--bitveins-shell-accent)] sm:flex"
        role="separator"
        tabindex="0"
        @keydown="resizeWithKeyboard"
        @pointerdown.prevent="beginResize"
      />

      <div
        v-if="loading"
        class="grid h-full min-h-72 place-items-center text-[var(--bitveins-shell-text-muted)]"
      >
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
          /> Loading history…
        </div>
      </div>

      <div
        v-else-if="error && !graph"
        class="grid h-full min-h-72 place-items-center p-6 text-center"
      >
        <div class="max-w-sm space-y-3">
          <UIcon
            name="i-lucide-git-branch"
            class="mx-auto size-9 text-[var(--bitveins-shell-text-subtle)]"
          />
          <p class="text-[var(--bitveins-shell-text-muted)]">
            {{ error }}
          </p>
          <UButton
            color="neutral"
            label="Try again"
            size="sm"
            variant="soft"
            @click="load(true)"
          />
        </div>
      </div>

      <div
        v-else-if="graph"
        class="min-w-[680px]"
        data-git-graph
      >
        <div class="sticky top-0 z-10 grid h-8 grid-cols-[minmax(320px,1fr)_150px_130px_72px] items-center border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-2 text-[length:var(--bitveins-ui-caption-size)] font-semibold text-[var(--bitveins-shell-text-muted)]">
          <span>Graph / Description</span><span>Date</span><span>Author</span><span>Commit</span>
        </div>

        <GitGraphCanvas :rows="rows">
          <article
            v-for="row in rows"
            :key="row.commit.hash"
          >
            <button
              class="grid h-[34px] w-full grid-cols-[minmax(320px,1fr)_150px_130px_72px] items-center px-2 text-left shadow-[inset_0_-1px_0_var(--bitveins-shell-border)] transition-colors hover:bg-[var(--bitveins-shell-panel-muted)]"
              :class="selectedHash === row.commit.hash ? 'bg-[var(--bitveins-shell-accent-soft)]' : ''"
              type="button"
              :data-git-commit="row.commit.hash"
              @click="toggleCommit(row.commit.hash)"
            >
              <span class="flex min-w-0 items-center">
                <span
                  aria-hidden="true"
                  class="shrink-0"
                  :style="{ width: `${graphWidth}px` }"
                />
                <span class="flex min-w-0 items-center gap-1.5">
                  <span
                    v-for="reference in row.commit.references"
                    :key="`${reference.kind}:${reference.name}`"
                    class="max-w-32 shrink-0 truncate rounded border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] px-1.5 py-0.5 text-[length:var(--bitveins-ui-micro-size)]"
                    :title="reference.name"
                  >
                    {{ reference.name }}
                  </span>
                  <span class="truncate text-[length:var(--bitveins-ui-label-size)]">{{ row.commit.subject }}</span>
                </span>
              </span>
              <span class="truncate text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)]">{{ formatDate(row.commit.authoredAt) }}</span>
              <span class="truncate text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)]">{{ row.commit.authorName }}</span>
              <span class="font-mono text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]">{{ row.commit.shortHash }}</span>
            </button>

            <div
              v-if="selectedHash === row.commit.hash"
            >
              <div
                v-if="loadingDetails === row.commit.hash"
                class="grid min-h-36 place-items-center bg-[var(--bitveins-shell-panel)] text-[var(--bitveins-shell-text-muted)]"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-4 animate-spin"
                />
              </div>
              <GitCommitDetailsPanel
                v-else-if="details.get(row.commit.hash)"
                :details="details.get(row.commit.hash)!"
                :graph-gutter="8 + graphWidth"
                :opening-path="openingPath"
                @open-diff="openFileDiff(row.commit.hash, $event)"
              />
            </div>
          </article>
        </GitGraphCanvas>

        <div
          v-if="error"
          class="border-b border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-500"
        >
          {{ error }}
        </div>
        <div
          v-if="graph.hasMore"
          class="p-3 text-center"
        >
          <UButton
            :loading="loadingMore"
            color="neutral"
            label="Load more commits"
            size="sm"
            variant="soft"
            @click="load(false)"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
