<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'

const props = defineProps<{
  modelValue: string
  filePath: string
  line?: number
  column?: number
  navigationToken?: number
  readOnly?: boolean
  highlightedLines?: number[]
  highlightTone?: 'added' | 'deleted'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'save': []
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let initGeneration = 0

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

async function loadLanguageExtension(filename: string): Promise<Extension> {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'vue':
      return (await import('@codemirror/lang-vue')).vue()
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({
        jsx: true,
        typescript: true,
      })
    case 'html':
      return (await import('@codemirror/lang-html')).html()
    case 'css':
    case 'scss':
      return (await import('@codemirror/lang-css')).css()
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'md':
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown()
    default:
      return []
  }
}

const customStyles = EditorView.theme({
  '&': {
    height: '100%',
    width: '100%',
    backgroundColor: '#1e1e1e',
    color: '#abb2bf',
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
  },
  '.cm-gutters': {
    backgroundColor: '#1e1e1e',
    color: '#5c6370',
    borderRight: '1px solid #2c313c',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2c313c',
    color: '#abb2bf',
  },
  '.cm-activeLine': {
    backgroundColor: '#2c313c',
  },
})

const lightStyles = EditorView.theme({
  '&': {
    height: '100%',
    width: '100%',
    backgroundColor: '#ffffff',
    color: '#383a42',
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
  },
  '.cm-gutters': {
    backgroundColor: '#f9f9f9',
    color: '#a0a1a7',
    borderRight: '1px solid #e5e5e5',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f0f0f0',
    color: '#383a42',
  },
  '.cm-activeLine': {
    backgroundColor: '#f0f0f0',
  },
})

function stateLineStart(value: string, lineNumber: number): number {
  let offset = 0
  for (let line = 1; line < lineNumber; line += 1) {
    const next = value.indexOf('\n', offset)
    if (next === -1) return value.length
    offset = next + 1
  }
  return offset
}

async function initEditor(): Promise<void> {
  const container = editorContainer.value
  if (!container) return

  const generation = ++initGeneration
  const languageExtension = await loadLanguageExtension(props.filePath)
  if (generation !== initGeneration || !editorContainer.value) return

  const extensions: Extension[] = [
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    languageExtension,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!props.readOnly && update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    }),
  ]

  if (props.readOnly) {
    extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false))
    const className = props.highlightTone === 'deleted' ? 'cm-diff-line-deleted' : 'cm-diff-line-added'
    const ranges = (props.highlightedLines || []).flatMap((number) => {
      if (number < 1 || number > props.modelValue.split('\n').length) return []
      return [Decoration.line({ attributes: { class: className } }).range(stateLineStart(props.modelValue, number))]
    })
    extensions.push(EditorView.decorations.of(Decoration.set(ranges, true)))
  }
  else {
    extensions.push(
      highlightActiveLineGutter(),
      history(),
      indentOnInput(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: 'Mod-s',
          run: () => {
            emit('save')
            return true
          },
        },
      ]),
    )
  }

  if (isDark.value) {
    extensions.push(oneDark, customStyles)
  }
  else {
    extensions.push(lightStyles)
  }

  const state = EditorState.create({
    doc: props.modelValue,
    extensions,
  })

  editorView = new EditorView({
    state,
    parent: container,
  })
  revealRequestedPosition()
}

function revealRequestedPosition(): void {
  if (!editorView || !props.line) return
  const lineNumber = Math.min(Math.max(1, props.line), editorView.state.doc.lines)
  const line = editorView.state.doc.line(lineNumber)
  const offset = Math.min(Math.max(0, (props.column ?? 1) - 1), line.length)
  const anchor = line.from + offset
  editorView.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
  })
  editorView.focus()
}

function recreateEditor(): void {
  initGeneration += 1
  editorView?.destroy()
  editorView = null
  void initEditor()
}

onMounted(() => {
  void initEditor()
})

onBeforeUnmount(() => {
  initGeneration += 1
  editorView?.destroy()
})

watch(() => props.filePath, () => {
  recreateEditor()
})

watch(() => [props.readOnly, props.highlightTone, props.highlightedLines?.join(',')], () => {
  recreateEditor()
})

watch(() => props.modelValue, (newVal) => {
  if (editorView && newVal !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: newVal },
    })
  }
})

watch(() => props.navigationToken, () => {
  revealRequestedPosition()
})

watch(() => colorMode.value, () => {
  recreateEditor()
})
</script>

<template>
  <div
    ref="editorContainer"
    class="h-full w-full overflow-hidden"
  />
</template>

<style>
/* Override default codemirror heights to expand */
.cm-editor {
  height: 100% !important;
}

.cm-diff-line-added {
  background: color-mix(in srgb, var(--bitveins-agent-working) 15%, transparent);
}

.cm-diff-line-deleted {
  background: color-mix(in srgb, var(--bitveins-agent-failed) 15%, transparent);
}
</style>
