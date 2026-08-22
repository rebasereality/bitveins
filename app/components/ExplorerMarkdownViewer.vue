<script setup lang="ts">
import { computed } from 'vue'
import type { ExplorerTextDocument } from '~/types/explorer'
import { renderExplorerMarkdown } from '~/utils/markdown-renderer'

const props = defineProps<{
  document: ExplorerTextDocument
  sessionName: string
}>()

const emit = defineEmits<{
  openPath: [path: string]
}>()

const rendered = computed(() => renderExplorerMarkdown(props.document.content, {
  documentPath: props.document.path,
  sessionName: props.sessionName,
}))

function handleClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const link = target.closest<HTMLAnchorElement>('a[data-explorer-path]')
  const path = link?.dataset.explorerPath
  if (!path) return
  event.preventDefault()
  emit('openPath', path)
}
</script>

<template>
  <div class="h-full overflow-auto bg-[var(--bitveins-terminal-bg)] bitveins-scrollbar">
    <!-- markdown-it escapes raw HTML and rejects unsafe link protocols. -->
    <!-- eslint-disable vue/no-v-html -->
    <article
      class="markdown-preview mx-auto min-h-full w-full max-w-5xl px-5 py-6 text-[length:var(--bitveins-ui-label-size)] leading-6 text-[var(--bitveins-shell-text)] sm:px-8"
      data-markdown-preview
      @click="handleClick"
      v-html="rendered"
    />
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>

<style scoped>
.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  color: var(--bitveins-shell-text);
  font-weight: 650;
  line-height: 1.3;
  margin: 1.5em 0 0.65em;
}

.markdown-preview :deep(h1) {
  border-bottom: 1px solid var(--bitveins-shell-border);
  font-size: 1.75em;
  padding-bottom: 0.35em;
}

.markdown-preview :deep(h2) {
  border-bottom: 1px solid var(--bitveins-shell-border);
  font-size: 1.4em;
  padding-bottom: 0.3em;
}

.markdown-preview :deep(h3) {
  font-size: 1.18em;
}

.markdown-preview :deep(p),
.markdown-preview :deep(ul),
.markdown-preview :deep(ol),
.markdown-preview :deep(blockquote),
.markdown-preview :deep(pre),
.markdown-preview :deep(table) {
  margin: 0.8em 0;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 1.6em;
}

.markdown-preview :deep(ul) {
  list-style: disc;
}

.markdown-preview :deep(ol) {
  list-style: decimal;
}

.markdown-preview :deep(li + li) {
  margin-top: 0.25em;
}

.markdown-preview :deep(a) {
  color: var(--bitveins-shell-accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--bitveins-shell-accent) 45%, transparent);
  text-underline-offset: 2px;
}

.markdown-preview :deep(code) {
  border: 1px solid var(--bitveins-shell-border);
  border-radius: 0.3rem;
  background: var(--bitveins-shell-panel);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.92em;
  padding: 0.12em 0.35em;
}

.markdown-preview :deep(pre) {
  overflow: auto;
  border: 1px solid var(--bitveins-shell-border);
  border-radius: 0.45rem;
  background: var(--bitveins-shell-panel);
  padding: 0.9rem 1rem;
}

.markdown-preview :deep(pre code) {
  border: 0;
  background: transparent;
  padding: 0;
}

.markdown-preview :deep(blockquote) {
  border-left: 3px solid var(--bitveins-shell-accent);
  color: var(--bitveins-shell-text-muted);
  padding-left: 1rem;
}

.markdown-preview :deep(table) {
  display: block;
  max-width: 100%;
  overflow: auto;
  border-collapse: collapse;
}

.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid var(--bitveins-shell-border);
  padding: 0.4rem 0.65rem;
  text-align: left;
}

.markdown-preview :deep(th) {
  background: var(--bitveins-shell-panel);
  font-weight: 650;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.35rem;
}

.markdown-preview :deep(hr) {
  border: 0;
  border-top: 1px solid var(--bitveins-shell-border);
  margin: 1.5rem 0;
}
</style>
