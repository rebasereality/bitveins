import { describe, expect, it } from 'vitest'
import { renderExplorerMarkdown } from '../../../app/utils/markdown-renderer'

describe('renderExplorerMarkdown', () => {
  const environment = {
    documentPath: 'docs/README.md',
    sessionName: 'demo session',
  }

  it('renders common Markdown while keeping raw HTML inert', () => {
    const rendered = renderExplorerMarkdown([
      '# Heading',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '<script>alert("unsafe")</script>',
    ].join('\n'), environment)

    expect(rendered).toContain('<h1>Heading</h1>')
    expect(rendered).toContain('<table>')
    expect(rendered).toContain('&lt;script&gt;')
    expect(rendered).not.toContain('<script>')
  })

  it('rewrites workspace images and marks workspace links for Explorer navigation', () => {
    const rendered = renderExplorerMarkdown(
      '[Guide](./guide.md) ![Diagram](../assets/diagram.svg)',
      environment,
    )

    expect(rendered).toContain('data-explorer-path="docs/guide.md"')
    expect(rendered).toContain(
      '/api/sessions/demo%20session/files/image?path=assets%2Fdiagram.svg',
    )
  })

  it('protects external links and rejects dangerous protocols', () => {
    const rendered = renderExplorerMarkdown(
      '[Website](https://example.com) [Unsafe](javascript:alert(1))',
      environment,
    )

    expect(rendered).toContain('target="_blank"')
    expect(rendered).toContain('rel="noopener noreferrer"')
    expect(rendered).not.toContain('href="javascript:')
  })
})
