import type { TmuxPaneViewport } from '../../ports/tmux-gateway'

type TmuxRunner = (args: readonly string[]) => Promise<string>

export async function captureTmuxPaneViewport(
  run: TmuxRunner,
  target: string,
): Promise<TmuxPaneViewport> {
  const [inMode = '0', scroll = '0', height = '1', cursorX = '0', cursorY = '0', cursor = '1'] = (
    await run([
      'display-message', '-p', '-t', target,
      '#{pane_in_mode}|#{scroll_position}|#{pane_height}|#{cursor_x}|#{cursor_y}|#{cursor_flag}',
    ])
  ).trim().split('|')
  const paneHeight = Math.max(1, Number.parseInt(height, 10) || 1)
  const scrollPosition = Math.max(0, Number.parseInt(scroll, 10) || 0)
  const captureRange = inMode === '1' && scrollPosition > 0
    ? ['-S', String(-scrollPosition), '-E', String(paneHeight - 1 - scrollPosition)]
    : []
  const captured = await run(['capture-pane', '-e', '-p', ...captureRange, '-t', target])
  // `capture-pane -p` terminates its stdout stream with one newline. Passing
  // that transport delimiter to xterm would scroll a pane-height viewport by
  // one row and move the first row (often the shell prompt) off screen.
  const data = captured.replace(/\r?\n$/u, '')
  return {
    cursorVisible: cursor === '1',
    cursorX: Math.max(0, Number.parseInt(cursorX, 10) || 0),
    cursorY: Math.max(0, Number.parseInt(cursorY, 10) || 0),
    data,
    inMode: inMode === '1',
    scrollPosition,
  }
}
