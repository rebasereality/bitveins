<script setup lang="ts">
import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { MergeView } from '@codemirror/merge'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, lineNumbers } from '@codemirror/view'
import { loadCodeLanguageExtension } from '~/editor/code-language'

const props = defineProps<{
  after: string
  before: string
  filePath: string
}>()

const container = ref<HTMLDivElement | null>(null)
const colorMode = useColorMode()
let mergeView: MergeView | null = null
let initGeneration = 0

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bitveins-terminal-bg)',
    color: 'var(--bitveins-shell-text)',
    fontSize: '13px',
  },
  '.cm-content': {
    minHeight: '100%',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bitveins-terminal-chrome)',
    borderRight: '1px solid var(--bitveins-shell-border)',
    color: 'var(--bitveins-shell-text-subtle)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
  },
})

function sideExtensions(language: Extension): Extension[] {
  return [
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    language,
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    ...(colorMode.value === 'dark' ? [oneDark] : []),
    editorTheme,
  ]
}

async function createMergeView(): Promise<void> {
  const parent = container.value
  if (!parent) return
  const generation = ++initGeneration
  const language = await loadCodeLanguageExtension(props.filePath)
  if (generation !== initGeneration || !container.value) return

  mergeView?.destroy()
  parent.replaceChildren()
  mergeView = new MergeView({
    a: { doc: props.before, extensions: sideExtensions(language) },
    b: { doc: props.after, extensions: sideExtensions(language) },
    diffConfig: { scanLimit: 1000, timeout: 1500 },
    gutter: true,
    highlightChanges: true,
    orientation: 'a-b',
    parent,
  })
}

function recreateMergeView(): void {
  initGeneration += 1
  mergeView?.destroy()
  mergeView = null
  void createMergeView()
}

onMounted(() => void createMergeView())

onBeforeUnmount(() => {
  initGeneration += 1
  mergeView?.destroy()
})

watch(() => [props.before, props.after, props.filePath], recreateMergeView)
watch(() => colorMode.value, recreateMergeView)
</script>

<template>
  <div
    ref="container"
    class="bitveins-git-merge-editor min-h-0 flex-1 overflow-hidden"
    data-git-merge-editor
  />
</template>

<style>
.bitveins-git-merge-editor > .cm-mergeView {
  height: 100%;
  overflow: auto;
  scrollbar-color: var(--bitveins-shell-border-strong) var(--bitveins-terminal-chrome);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.bitveins-git-merge-editor > .cm-mergeView::-webkit-scrollbar {
  display: block;
  width: 10px;
  height: 10px;
}

.bitveins-git-merge-editor > .cm-mergeView::-webkit-scrollbar-track {
  background: var(--bitveins-terminal-chrome);
}

.bitveins-git-merge-editor > .cm-mergeView::-webkit-scrollbar-thumb {
  border: 2px solid var(--bitveins-terminal-chrome);
  border-radius: 999px;
  background: var(--bitveins-shell-border-strong);
}

.bitveins-git-merge-editor .cm-mergeViewEditors {
  min-height: 100%;
}

.bitveins-git-merge-editor .cm-mergeViewEditor {
  min-width: 0;
}

.bitveins-git-merge-editor .cm-mergeViewEditor + .cm-mergeViewEditor {
  border-left: 1px solid var(--bitveins-shell-border);
}

.bitveins-git-merge-editor .cm-merge-a .cm-changedLine,
.bitveins-git-merge-editor .cm-merge-a .cm-changedLineGutter {
  background-color: color-mix(in srgb, var(--bitveins-agent-failed) 15%, transparent);
}

.bitveins-git-merge-editor .cm-merge-b .cm-changedLine,
.bitveins-git-merge-editor .cm-merge-b .cm-changedLineGutter {
  background-color: color-mix(in srgb, var(--bitveins-agent-working) 15%, transparent);
}

.bitveins-git-merge-editor .cm-merge-a .cm-changedText {
  background: color-mix(in srgb, var(--bitveins-agent-failed) 28%, transparent);
}

.bitveins-git-merge-editor .cm-merge-b .cm-changedText {
  background: color-mix(in srgb, var(--bitveins-agent-working) 28%, transparent);
}
</style>
