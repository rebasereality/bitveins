import type { Extension } from '@codemirror/state'

export async function loadCodeLanguageExtension(filename: string): Promise<Extension> {
  const extension = filename.split('.').pop()?.toLowerCase()
  switch (extension) {
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
