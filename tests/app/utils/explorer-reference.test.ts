import { describe, expect, it } from 'vitest'
import {
  explorerImageUrl,
  resolveExplorerReference,
} from '../../../app/utils/explorer-reference'

describe('resolveExplorerReference', () => {
  it('resolves relative and absolute workspace paths with queries and fragments', () => {
    expect(resolveExplorerReference(
      'docs/README.md',
      '../assets/diagram.svg?raw=1#preview',
    )).toEqual({
      path: 'assets/diagram.svg',
      fragment: 'preview',
    })
    expect(resolveExplorerReference(
      'docs/README.md',
      '/assets/screenshot.png',
    )).toEqual({
      path: 'assets/screenshot.png',
      fragment: undefined,
    })
  })

  it('normalizes encoded and Windows-style paths without throwing on malformed encoding', () => {
    expect(resolveExplorerReference(
      'docs/README.md',
      '.\\guides\\hello%20world.md',
    )).toEqual({
      path: 'docs/guides/hello world.md',
      fragment: undefined,
    })
    expect(resolveExplorerReference(
      'docs/README.md',
      'broken%ZZ.md',
    )).toMatchObject({ path: 'docs/broken%ZZ.md' })
  })

  it('rejects references that do not resolve to a workspace file', () => {
    expect(resolveExplorerReference('docs/README.md', '../../outside.md')).toBeNull()
    expect(resolveExplorerReference('docs/README.md', '/')).toBeNull()
    expect(resolveExplorerReference('docs/README.md', '#heading')).toBeNull()
    expect(resolveExplorerReference('docs/README.md', 'https://example.com')).toBeNull()
    expect(resolveExplorerReference('docs/README.md', '  ')).toBeNull()
  })

  it('builds an encoded authenticated image URL', () => {
    expect(explorerImageUrl('demo session', 'assets/a b.png')).toBe(
      '/api/sessions/demo%20session/files/image?path=assets%2Fa+b.png',
    )
  })
})
