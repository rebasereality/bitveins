import { describe, expect, it } from 'vitest'
import {
  parseFileReferences,
  parseSelectedFileReferences,
} from '~/utils/file-reference-parser'

describe('parseFileReferences', () => {
  it('parses relative, absolute, home and positioned references', () => {
    const parsed = parseFileReferences([
      'src/components/App.vue',
      './docs/mockup.png',
      '/home/theman/project/design/mockup.webp',
      '~/notes/readme.md:42',
      'server/api/foo.ts:42:17',
    ].join(' '))

    expect(parsed.map(({ path, line, column }) => ({ path, line, column }))).toEqual([
      { path: 'src/components/App.vue', line: undefined, column: undefined },
      { path: './docs/mockup.png', line: undefined, column: undefined },
      { path: '/home/theman/project/design/mockup.webp', line: undefined, column: undefined },
      { path: '~/notes/readme.md', line: 42, column: undefined },
      { path: 'server/api/foo.ts', line: 42, column: 17 },
    ])
  })

  it('supports quoted paths with spaces and excludes URLs', () => {
    const parsed = parseFileReferences(
      'open "./design/final mockup.png:8:2", not https://example.com/file.png or mailto:user@example.com',
    )

    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      path: './design/final mockup.png',
      line: 8,
      column: 2,
      text: './design/final mockup.png:8:2',
    })
  })

  it('ignores shell prompts while retaining paths in their command', () => {
    const parsed = parseFileReferences(
      'theman@host:/home/theman/project$ cat src/file.ts',
    )

    expect(parsed.map(reference => reference.path)).toEqual(['src/file.ts'])
  })

  it('bounds the amount of work', () => {
    const text = Array.from({ length: 40 }, (_, index) => `src/file-${index}.ts`).join(' ')
    expect(parseFileReferences(text)).toHaveLength(32)
  })

  it('rejects invalid source positions', () => {
    expect(parseFileReferences('src/file.ts:0 src/other.ts:4:0')).toEqual([])
  })
})

describe('parseSelectedFileReferences', () => {
  it('prefers a complete path reconstructed from a terminal hard wrap', () => {
    const parsed = parseSelectedFileReferences(
      'docs/plans/2026-07-24-refonte-ecran-\n  service.md:1',
    )

    expect(parsed[0]).toMatchObject({
      path: 'docs/plans/2026-07-24-refonte-ecran-service.md',
      line: 1,
    })
    expect(parsed).toContainEqual(expect.objectContaining({
      path: 'service.md',
      line: 1,
    }))
  })

  it('does not duplicate references that are unchanged by normalization', () => {
    expect(parseSelectedFileReferences('src/app.ts:4')).toHaveLength(1)
  })
})
