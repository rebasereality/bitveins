import type { Extension } from '@codemirror/state'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

const SPECIAL_NAME_TO_LANGUAGE: Record<string, string> = {
  '.bashrc': 'Shell',
  '.zshrc': 'Shell',
  '.bash_profile': 'Shell',
  '.bash_aliases': 'Shell',
  '.bash_logout': 'Shell',
  '.profile': 'Shell',
  'bashrc': 'Shell',
  'zshrc': 'Shell',
  'dockerfile': 'Dockerfile',
  'containerfile': 'Dockerfile',
  'makefile': 'Shell',
  'gnumakefile': 'Shell',
}

export async function loadCodeLanguageExtension(filePath: string): Promise<Extension> {
  if (!filePath) return []

  const withoutQuery = filePath.split('?')[0] ?? filePath
  const cleanPath = withoutQuery.split('#')[0] ?? withoutQuery
  const basename = cleanPath.split('/').pop() || cleanPath

  let desc = LanguageDescription.matchFilename(languages, basename)

  if (!desc) {
    const lower = basename.toLowerCase()
    const specialLang = SPECIAL_NAME_TO_LANGUAGE[lower]
    if (specialLang) {
      desc = LanguageDescription.matchLanguageName(languages, specialLang)
    }
    else if (
      lower.startsWith('.env')
      || lower === '.gitignore'
      || lower === '.npmignore'
      || lower === '.dockerignore'
      || lower === '.editorconfig'
    ) {
      desc = LanguageDescription.matchLanguageName(languages, 'Properties files')
    }
    else if (lower.startsWith('dockerfile.')) {
      desc = LanguageDescription.matchLanguageName(languages, 'Dockerfile')
    }
  }

  if (desc) {
    try {
      const support = await desc.load()
      return support ? support.extension : []
    }
    catch (err) {
      console.warn(`Failed to load syntax highlighting for ${filePath}:`, err)
      return []
    }
  }

  return []
}
