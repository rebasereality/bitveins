import { describe, expect, it, vi } from 'vitest'
import { LanguageDescription } from '@codemirror/language'
import { loadCodeLanguageExtension } from '~/editor/code-language'

describe('loadCodeLanguageExtension', () => {
  it('returns empty array for empty or missing path', async () => {
    expect(await loadCodeLanguageExtension('')).toEqual([])
  })

  it('handles paths with query parameters and hash fragments', async () => {
    const extWithBoth = await loadCodeLanguageExtension('/src/components/App.vue?t=12345#L42')
    expect(extWithBoth).toBeDefined()
    expect(Array.isArray(extWithBoth) ? extWithBoth.length : 1).toBeGreaterThan(0)

    const extWithQueryOnly = await loadCodeLanguageExtension('main.py?version=2')
    expect(extWithQueryOnly).toBeDefined()

    const extWithHashOnly = await loadCodeLanguageExtension('lib.rs#L10')
    expect(extWithHashOnly).toBeDefined()
  })

  it('loads language extensions for popular programming languages', async () => {
    const testCases = [
      'main.py',
      'lib.rs',
      'server.c',
      'header.h',
      'engine.cpp',
      'Program.cs',
      'App.java',
      'index.php',
      'script.js',
      'app.ts',
      'Component.jsx',
      'Widget.tsx',
      'App.vue',
      'server.go',
      'index.html',
      'styles.css',
      'styles.scss',
      'config.json',
      'README.md',
      'docker-compose.yml',
      'schema.sql',
      'deploy.sh',
      '.bashrc',
      '.zshrc',
      '.bash_profile',
      '.bash_aliases',
      '.bash_logout',
      '.profile',
      'bashrc',
      'zshrc',
      'Dockerfile',
      'dockerfile',
      'Dockerfile.dev',
      'containerfile',
      'makefile',
      'gnumakefile',
      '.env',
      '.env.production',
      '.gitignore',
      '.npmignore',
      '.dockerignore',
      '.editorconfig',
      'Cargo.toml',
      'script.lua',
      'script.rb',
      'App.kt',
      'App.swift',
    ]

    for (const file of testCases) {
      const ext = await loadCodeLanguageExtension(file)
      expect(ext, `Expected language extension for ${file}`).toBeDefined()
      if (Array.isArray(ext)) {
        expect(ext.length, `Expected non-empty extension array for ${file}`).toBeGreaterThan(0)
      }
    }
  })

  it('returns empty array for unrecognized file extension', async () => {
    const ext = await loadCodeLanguageExtension('unknown.foobarxyz123')
    expect(ext).toEqual([])
  })

  it('handles load failures gracefully and returns empty array', async () => {
    const spy = vi.spyOn(LanguageDescription, 'matchFilename').mockReturnValue({
      load: () => Promise.reject(new Error('Simulated load error')),
    } as unknown as LanguageDescription)

    const ext = await loadCodeLanguageExtension('failing.py')
    expect(ext).toEqual([])

    spy.mockRestore()
  })

  it('returns empty array when support load resolves to null', async () => {
    const spy = vi.spyOn(LanguageDescription, 'matchFilename').mockReturnValue({
      load: () => Promise.resolve(null as any),
    } as unknown as LanguageDescription)

    const ext = await loadCodeLanguageExtension('null_support.py')
    expect(ext).toEqual([])

    spy.mockRestore()
  })
})
