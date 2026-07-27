// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadRemotePath,
  explorerAbsolutePath,
} from '../../../app/utils/file-download'

describe('file download helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('resolves Explorer paths from their tmux session root', () => {
    expect(explorerAbsolutePath('/workspace/project', 'docs/readme.md'))
      .toBe('/workspace/project/docs/readme.md')
    expect(explorerAbsolutePath('/workspace/project/', '/tmp/report.txt'))
      .toBe('/tmp/report.txt')
    expect(explorerAbsolutePath(undefined, 'notes.txt')).toBe('notes.txt')
  })

  it('preflights and starts a browser download for the requested path', async () => {
    const fetcher = vi.fn().mockResolvedValue({ valid: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    vi.stubGlobal('$fetch', fetcher)

    await downloadRemotePath('  /tmp/report 2026.txt  ')

    expect(fetcher).toHaveBeenCalledWith('/api/download', {
      query: { check: 'true', path: '/tmp/report 2026.txt' },
    })
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.instances[0] as HTMLAnchorElement).getAttribute('href'))
      .toBe('/api/download?path=%2Ftmp%2Freport%202026.txt')
    expect(document.body.querySelector('a')).toBeNull()
  })
})
