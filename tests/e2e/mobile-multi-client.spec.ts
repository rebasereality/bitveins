import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const execFileAsync = promisify(execFile)
const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-24)
const sessionName = `mobile_sync_${safeRunId}`

test('lets an active mobile client claim tmux size from an existing desktop client', async ({ browser, page }) => {
  await mkdir(workspace, { recursive: true })
  const mobileSocketFrames: string[][] = []
  page.on('websocket', (socket) => {
    const frames: string[] = []
    mobileSocketFrames.push(frames)
    socket.on('framesent', event => frames.push(String(event.payload)))
  })
  const desktopContext = await browser.newContext({ viewport: { height: 720, width: 1280 } })
  const desktopPage = await desktopContext.newPage()

  try {
    await authenticate(desktopPage)
    const created = await desktopPage.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await desktopPage.reload()
    await desktopPage.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(desktopPage.locator('[data-connection-state="attached"]')).toBeVisible()
    await desktopPage.getByRole('button', { name: 'Split Horizontal' }).click()
    await expect(desktopPage.locator('[data-tmux-pane]')).toHaveCount(2)
    await desktopPage.getByRole('button', { name: 'Split Vertical' }).click()
    await expect(desktopPage.locator('[data-tmux-pane]')).toHaveCount(3)
    const desktopFocusedPane = desktopPage.locator('[data-tmux-pane][data-focused="true"]')
    const focusedPaneId = await desktopFocusedPane.getAttribute('data-pane-id')
    if (!focusedPaneId) throw new Error('The desktop client has no focused tmux pane.')
    await expect(desktopFocusedPane.locator('.xterm-rows')).toContainText(/[$#]\s*$/u)
    await execFileAsync('tmux', [
      '-L', socketName, 'send-keys', '-t', focusedPaneId,
      'seq 1 100 | sed \'s/^/MULTI_CLIENT_TUI_/\' | less', 'C-m',
    ])
    await expect.poll(async () => (await execFileAsync('tmux', [
      '-L', socketName, 'display-message', '-p', '-t', focusedPaneId, '#{alternate_on}',
    ])).stdout.trim()).toBe('1')
    await expect(desktopFocusedPane.locator('.xterm-rows')).toContainText('MULTI_CLIENT_TUI_')

    await authenticate(page)
    await page.getByLabel('Open sessions').click()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(page.locator('[data-tmux-pane]')).toHaveCount(3)
    const mobileFocusedPane = page.locator(`[data-tmux-pane][data-pane-id="${focusedPaneId}"]`)
    await expect(mobileFocusedPane).toHaveAttribute('data-focused', 'true')
    await expect(mobileFocusedPane.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(mobileFocusedPane.locator('.xterm-rows')).toContainText('MULTI_CLIENT_TUI_')
    const requestedMobileWindowSize = () => {
      for (const frames of mobileSocketFrames) {
        let attachedToFocusedPane = false
        let requestedSize: string | null = null
        for (const rawFrame of frames) {
          try {
            const message = JSON.parse(rawFrame) as {
              action?: string
              payload?: { cols?: number, paneId?: string, rows?: number }
            }
            if (message.action === 'attachPane') {
              attachedToFocusedPane = message.payload?.paneId === focusedPaneId
            }
            if (
              attachedToFocusedPane
              && (message.action === 'attachPane' || message.action === 'resize')
              && message.payload?.cols
              && message.payload.rows
            ) {
              requestedSize = `${message.payload.cols}x${message.payload.rows}`
            }
          }
          catch {
            // Ignore non-JSON websocket frames from unrelated connections.
          }
        }
        if (requestedSize) return requestedSize
      }
      return null
    }
    await expect.poll(requestedMobileWindowSize).not.toBeNull()
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    const commandFooter = page.locator('footer').filter({
      has: page.getByRole('button', { name: 'Live', exact: true }),
    })
    await expect(commandFooter).toBeVisible()
    await expect.poll(async () => {
      const [terminalBox, footerBox] = await Promise.all([
        mobileFocusedPane.locator('[data-terminal-host]').boundingBox(),
        commandFooter.boundingBox(),
      ])
      if (!terminalBox || !footerBox) return Number.POSITIVE_INFINITY
      return Math.round(terminalBox.y + terminalBox.height - footerBox.y)
    }).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Open keyboard' }).click()
    const marker = '/MOBILE_SYNC_MARKER'
    await page.keyboard.insertText(marker)

    await expect.poll(async () => (await execFileAsync('tmux', [
      '-L', socketName, 'capture-pane', '-p', '-t', focusedPaneId,
    ])).stdout).toContain(marker)
    await expect.poll(async () => {
      const requestedSize = requestedMobileWindowSize()
      const tmuxSize = (await execFileAsync('tmux', [
        '-L', socketName, 'display-message', '-p', '-t', focusedPaneId,
        '#{window_width}x#{window_height}',
      ])).stdout.trim()
      return requestedSize !== null && tmuxSize === requestedSize
    }).toBe(true)
    await expect(desktopFocusedPane.locator('.xterm-rows')).toContainText(marker)
    await expect(mobileFocusedPane.locator('.xterm-rows')).toContainText(marker)
  }
  finally {
    await desktopPage.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
    await desktopContext.close()
  }
})
