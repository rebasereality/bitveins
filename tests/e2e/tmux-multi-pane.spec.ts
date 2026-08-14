import { execFile } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)
const sessionName = `panes_${safeRunId}`

test('renders stable resizable tmux panes and pastes an image into the focused live pane', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  const sentFrames: string[] = []
  const receivedFrames: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framesent', event => sentFrames.push(String(event.payload)))
    socket.on('framereceived', event => receivedFrames.push(String(event.payload)))
  })
  await authenticate(page)
  let uploadedPath: string | null = null

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()

    const renderedPanes = page.locator('[data-tmux-pane]')
    await expect(renderedPanes).toHaveCount(1)
    await expect(renderedPanes.locator('[data-connection-state="attached"]')).toHaveCount(1)
    expect(await renderedPanes.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
    const singlePaneId = await renderedPanes.getAttribute('data-pane-id')
    if (!singlePaneId) throw new Error('The initial pane has no tmux id.')
    const singlePaneWidth = Number((await execFileAsync('tmux', [
      '-L', socketName, 'display-message', '-p', '-t', `${sessionName}:0`,
      '#{pane_width}',
    ])).stdout.trim())
    const edgeMarker = 'X'.repeat(singlePaneWidth)
    await execFileAsync('tmux', [
      '-L', socketName, 'send-keys', '-t', singlePaneId,
      '-l', '--', `clear; printf '${edgeMarker}'; sleep 30\r`,
    ])
    await expect.poll(() => renderedPanes.locator('.xterm-rows > div').evaluateAll(rows => (
      rows.map(row => (row.textContent?.match(/X/g) || []).length).filter(Boolean)
    ))).toEqual([singlePaneWidth])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', singlePaneId, 'C-c'])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', singlePaneId, 'clear', 'C-m'])

    await expect.poll(() => sentFrames.some((raw) => {
      try {
        return (JSON.parse(raw) as { action?: string }).action === 'attachPane'
      }
      catch {
        return false
      }
    })).toBe(true)

    sentFrames.length = 0
    const asyncInput = page.locator('textarea:not(.xterm-helper-textarea)')
    await asyncInput.fill('echo pane delivery')
    await asyncInput.press('Control+Enter')
    await expect.poll(() => sentFrames.flatMap((raw) => {
      try {
        const message = JSON.parse(raw) as { action?: string, payload?: { data?: string } }
        if (message.action !== 'reliableInput' || typeof message.payload?.data !== 'string') return []
        const data = message.payload.data
        return data.startsWith('\x1b[200~') && data.endsWith('\x1b[201~')
          ? [data.slice('\x1b[200~'.length, -'\x1b[201~'.length)]
          : [data]
      }
      catch {
        return []
      }
    }), {
      message: `Sent frames: ${JSON.stringify(sentFrames)}\nReceived frames: ${JSON.stringify(receivedFrames)}`,
    }).toEqual([
      'echo pane delivery',
      '\r',
    ])

    await execFileAsync('tmux', [
      '-L', socketName, 'send-keys', '-t', singlePaneId,
      'seq 1 100 | sed \'s/^/PRIMARY_TUI_/\' | less', 'C-m',
    ])
    await expect.poll(async () => (await execFileAsync('tmux', [
      '-L', socketName, 'display-message', '-p', '-t', singlePaneId, '#{alternate_on}',
    ])).stdout.trim()).toBe('1')
    await expect(renderedPanes.first().locator('.xterm-rows')).toContainText('PRIMARY_TUI_')

    const horizontalResponse = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/split')
    ))
    await page.getByRole('button', { name: 'Split Horizontal' }).click()
    expect((await horizontalResponse).ok()).toBe(true)
    await expect(renderedPanes).toHaveCount(2)
    const newHorizontalPane = page.locator('[data-tmux-pane][data-focused="true"]')
    await expect(newHorizontalPane).toHaveCount(1)
    await expect(newHorizontalPane.locator('.xterm-rows')).toContainText(/[$#]\s*$/u)
    expect(await newHorizontalPane.evaluate(element => getComputedStyle(element).boxShadow)).toContain('inset')
    expect(await renderedPanes.first().evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
    const rightPaneId = await newHorizontalPane.getAttribute('data-pane-id')
    if (!rightPaneId) throw new Error('The right pane has no tmux id.')
    const rightPane = page.locator(`[data-pane-id="${rightPaneId}"]`)

    const horizontalBoxes = await renderedPanes.evaluateAll(elements => elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { height: box.height, width: box.width, x: box.x, y: box.y }
    }))
    expect(Math.abs(horizontalBoxes[0]!.y - horizontalBoxes[1]!.y)).toBeLessThan(2)
    expect(horizontalBoxes[1]!.x).toBeGreaterThan(horizontalBoxes[0]!.x)

    const selected = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/select-pane')
    ))
    await renderedPanes.first().click({ position: { x: 10, y: 10 } })
    expect((await selected).ok()).toBe(true)
    const reselected = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/select-pane')
    ))
    await rightPane.click({ position: { x: 10, y: 10 } })
    expect((await reselected).ok()).toBe(true)

    const verticalResponse = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/split')
    ))
    await page.getByRole('button', { name: 'Split Vertical' }).click()
    expect((await verticalResponse).ok()).toBe(true)
    await expect(renderedPanes).toHaveCount(3)
    const newVerticalPane = page.locator('[data-tmux-pane][data-focused="true"]')
    await expect(newVerticalPane.locator('.xterm-rows')).toContainText(/[$#]\s*$/u)

    const busyPaneId = await renderedPanes.first().getAttribute('data-pane-id')
    if (!busyPaneId) throw new Error('The first pane has no tmux id.')
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', busyPaneId, 'q'])
    await expect.poll(async () => (await execFileAsync('tmux', [
      '-L', socketName, 'display-message', '-p', '-t', busyPaneId, '#{alternate_on}',
    ])).stdout.trim()).toBe('0')
    await expect(renderedPanes.first().locator('.xterm-rows')).toContainText(/[$#]\s*$/u)
    await execFileAsync('tmux', [
      '-L', socketName, 'send-keys', '-t', busyPaneId,
      'for i in $(seq 1 1000); do printf "busy-%04d\\n" "$i"; done', 'C-m',
    ])
    await expect(renderedPanes.first().locator('.xterm-rows')).toContainText('busy-1000')
    await expect(renderedPanes.locator('.xterm-viewport')).toHaveCount(3)
    for (const viewport of await renderedPanes.locator('.xterm-viewport').all()) {
      await expect(viewport).toHaveCSS('overflow-y', 'hidden')
      expect(await viewport.evaluate(element => element.scrollHeight - element.clientHeight)).toBe(0)
    }

    const resizers = page.locator('[data-pane-resizer]')
    await expect(resizers).toHaveCount(2)
    const verticalResizer = page.locator('[data-pane-resizer][data-orientation="vertical"]').first()
    await expect(verticalResizer).toBeVisible()
    const resizeLabel = await verticalResizer.getAttribute('aria-label')
    const resizedPaneId = resizeLabel?.split(' ').at(-1)
    if (!resizedPaneId) throw new Error('The resize handle has no target pane id.')
    const layoutSnapshot = () => renderedPanes.evaluateAll(elements => elements.map((element) => {
      const box = element.getBoundingClientRect()
      return [
        element.getAttribute('data-pane-id'),
        Math.round(box.x * 100) / 100,
        Math.round(box.y * 100) / 100,
        Math.round(box.width * 100) / 100,
        Math.round(box.height * 100) / 100,
      ]
    }))
    const settleLayout = () => renderedPanes.first().evaluate(async () => {
      await new Promise<void>((resolve) => {
        let previous = ''
        let stableFrames = 0
        const observe = () => {
          const next = JSON.stringify(Array.from(document.querySelectorAll('[data-tmux-pane]')).map((pane) => {
            const box = pane.getBoundingClientRect()
            return [box.x, box.y, box.width, box.height]
          }))
          stableFrames = next === previous ? stableFrames + 1 : 0
          previous = next
          if (stableFrames >= 4) resolve()
          else requestAnimationFrame(observe)
        }
        requestAnimationFrame(observe)
      })
    })
    const layoutBeforeResize = await layoutSnapshot()
    const paneWidth = async (): Promise<number> => Number((await execFileAsync('tmux', [
      '-L', socketName, 'display-message', '-p', '-t', resizedPaneId, '#{pane_width}',
    ])).stdout.trim())
    const widthBefore = await paneWidth()
    const resizerBox = await verticalResizer.boundingBox()
    if (!resizerBox) throw new Error('The vertical resize handle has no bounding box.')
    const resizeResponse = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/resize-pane')
    ))
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      resizerBox.x + resizerBox.width / 2 + 80,
      resizerBox.y + resizerBox.height / 2,
      { steps: 10 },
    )
    await page.mouse.up()
    expect((await resizeResponse).ok()).toBe(true)
    await expect.poll(paneWidth).not.toBe(widthBefore)
    await expect.poll(layoutSnapshot).not.toEqual(layoutBeforeResize)
    const settledPoll = await page.waitForResponse(response => (
      response.request().method() === 'GET' && response.url().endsWith('/panes')
    ))
    const stableTmuxGeometry = await settledPoll.json()
    await settleLayout()
    const baselineLayout = await layoutSnapshot()
    for (let poll = 0; poll < 2; poll += 1) {
      const pollResponse = await page.waitForResponse(response => (
        response.request().method() === 'GET' && response.url().endsWith('/panes')
      ))
      expect(await pollResponse.json()).toEqual(stableTmuxGeometry)
      await settleLayout()
      expect(await layoutSnapshot()).toEqual(baselineLayout)
    }

    const tmuxPaneIds = (await execFileAsync('tmux', [
      '-L', socketName, 'list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_id}',
    ])).stdout.trim().split('\n').sort()
    const htmlPaneIds = (await renderedPanes.evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-pane-id') || '').sort()
    )))
    expect(htmlPaneIds).toEqual(tmuxPaneIds)

    for (const [index, paneId] of tmuxPaneIds.entries()) {
      const marker = `PANE_${index}_${safeRunId}`
      await execFileAsync('tmux', [
        '-L', socketName, 'send-keys', '-t', paneId, '-l', '--', `printf '${marker}\\n'\r`,
      ])
      const pane = page.locator(`[data-pane-id="${paneId}"]`)
      await expect(pane.locator('.xterm-rows')).toContainText(marker)
      for (const siblingId of tmuxPaneIds.filter(candidate => candidate !== paneId)) {
        await expect(page.locator(`[data-pane-id="${siblingId}"]`).locator('.xterm-rows')).not.toContainText(marker)
      }
    }

    const paneToClose = renderedPanes.last()
    const closedPaneId = await paneToClose.getAttribute('data-pane-id')
    const closeResponse = page.waitForResponse(response => (
      response.request().method() === 'DELETE' && response.url().includes('/split?')
    ))
    await paneToClose.getByRole('button', { name: /Close tmux pane/ }).click()
    expect((await closeResponse).ok()).toBe(true)
    await expect(renderedPanes).toHaveCount(2)
    await expect(page.locator(`[data-pane-id="${closedPaneId}"]`)).toHaveCount(0)

    const focusedPane = renderedPanes.filter({ has: page.locator('[data-connection-state="attached"]') }).first()
    await focusedPane.click({ position: { x: 12, y: 12 } })
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    const uploadResponse = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/api/upload')
    ))
    const pasteResult = await focusedPane.locator('.xterm-helper-textarea').evaluate((target) => {
      const clipboard = new DataTransfer()
      clipboard.items.add(new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        'live-paste.png',
        { type: 'image/png' },
      ))
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
      target.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(pasteResult).toBe(true)
    const upload = await uploadResponse
    expect(upload.ok(), await upload.text()).toBe(true)
    const uploadBody = await upload.json() as { path: string }
    uploadedPath = uploadBody.path
    await expect(focusedPane.locator('.xterm-rows')).toContainText(uploadBody.path)
    expect(await readFile(uploadBody.path)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
    if (uploadedPath) await rm(uploadedPath, { force: true })
  }
})
