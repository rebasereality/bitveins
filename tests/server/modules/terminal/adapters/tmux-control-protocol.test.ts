import { describe, expect, it } from 'vitest'
import {
  decodeTmuxControlValue,
  parseTmuxPaneOutput,
} from '../../../../../server/modules/terminal/adapters/tmux-control-protocol'

describe('tmux control protocol', () => {
  it('decodes octal terminal bytes while preserving unicode output', () => {
    expect(decodeTmuxControlValue('é🙂\\033[31mred\\015\\012')).toBe('é🙂\u001B[31mred\r\n')
  })

  it('extracts regular and extended output for a single pane', () => {
    expect(parseTmuxPaneOutput('%output %12 hello\\015\\012')).toEqual({
      paneId: '%12',
      data: 'hello\r\n',
    })
    expect(parseTmuxPaneOutput('%extended-output %12 5 : later')).toEqual({
      paneId: '%12',
      data: 'later',
    })
    expect(parseTmuxPaneOutput('%layout-change @1 layout')).toBeNull()
  })
})
