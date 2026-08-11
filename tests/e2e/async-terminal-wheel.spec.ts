import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { expect, test, type Page } from '@playwright/test'
import { authenticate } from './support/authenticate'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}
const configuredSocketName: string = socketName

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-24)
const sessionName = `wheel_${safeRunId}`
const copyModeSessionName = `copy_${safeRunId}`
const viewportSessionName = `viewport_${safeRunId}`
const asyncResetSessionName = `reset_${safeRunId}`

function inputPayloads(frames: readonly string[]): string[] {
  return frames.flatMap((raw) => {
    try {
      const message = JSON.parse(raw) as {
        action?: string
        payload?: { data?: string }
      }
      return (message.action === 'input' || message.action === 'wheelInput')
        && typeof message.payload?.data === 'string'
        ? [message.payload.data]
        : []
    }
    catch {
      return []
    }
  })
}

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test.afterAll(async () => {
  await execFileAsync('tmux', ['-L', socketName, 'kill-server']).catch(() => undefined)
})

test('forwards legacy wheel input in Async mode without enabling keyboard input', async ({ page }) => {
  const sentFrames: string[] = []
  await page.routeWebSocket(/\/api\/ws/u, (client) => {
    const server = client.connectToServer()
    client.onMessage(message => server.send(message))
    server.onMessage((message) => {
      if (typeof message !== 'string') {
        client.send(message)
        return
      }
      try {
        const parsed = JSON.parse(message) as { type?: string, data?: string }
        if (parsed.type === 'stdout' && typeof parsed.data === 'string') {
          parsed.data = parsed.data.replaceAll('\u001B[?1006h', '\u001B[?1006l')
          client.send(JSON.stringify(parsed))
          return
        }
      }
      catch {
        // Forward non-JSON transport messages unchanged.
      }
      client.send(message)
    })
  })
  page.on('websocket', (socket) => {
    socket.on('framesent', event => sentFrames.push(String(event.payload)))
  })

  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: sessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(page.locator('textarea:not(.xterm-helper-textarea)')).toBeVisible()

    const terminalGridWidth = await page.locator('.xterm-screen').evaluate((screen) => {
      return {
        calculated: Number.parseFloat((screen as HTMLElement).style.width),
        rendered: screen.getBoundingClientRect().width,
      }
    })
    expect(terminalGridWidth.rendered).toBeCloseTo(terminalGridWidth.calculated, 1)

    await execFileAsync('tmux', [
      '-L',
      socketName,
      'send-keys',
      '-l',
      '-t',
      sessionName,
      'printf \'\\033[?1000h\\033[?1006h\'; sleep 10',
    ])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', sessionName, 'Enter'])
    await expect(page.locator('.xterm-rows')).toContainText('sleep 10')

    sentFrames.length = 0
    const terminal = page.locator('.xterm-screen')
    const terminalBox = await terminal.boundingBox()
    if (!terminalBox) throw new Error('The terminal has no bounding box.')

    await page.mouse.move(
      terminalBox.x + terminalBox.width / 2,
      terminalBox.y + terminalBox.height / 2,
    )
    await page.mouse.wheel(0, -120)

    await expect.poll(() => sentFrames.flatMap((raw) => {
      try {
        const message = JSON.parse(raw) as {
          action?: string
          payload?: { data?: string, encoding?: string }
        }
        if (message.action !== 'wheelInput' || message.payload?.encoding !== 'binary') return []
        return [Array.from(message.payload.data ?? '', character => character.charCodeAt(0))]
      }
      catch {
        return []
      }
    })).toContainEqual(expect.arrayContaining([27, 91, 77, 96]))

    sentFrames.length = 0
    await page.locator('.xterm-helper-textarea').focus()
    await page.keyboard.insertText('keyboard-must-stay-async')
    await page.waitForTimeout(100)

    expect(inputPayloads(sentFrames)).toEqual([])
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})

async function verifyCopyModeScrollRendering(page: Page, inputMode: 'Async' | 'Live'): Promise<void> {
  const testSessionName = `${copyModeSessionName}_${inputMode.toLowerCase()}`
  const receivedFrames: string[] = []
  const sentFrames: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', event => receivedFrames.push(String(event.payload)))
    socket.on('framesent', event => sentFrames.push(String(event.payload)))
  })
  await page.setViewportSize({ width: 1600, height: 600 })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: testSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await execFileAsync('tmux', ['-L', configuredSocketName, 'set-option', '-g', 'mouse', 'on'])
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-l',
      '-t',
      testSessionName,
      'for i in $(seq 1 1000); do printf "history-%04d\\n" "$i"; done',
    ])
    await execFileAsync('tmux', ['-L', configuredSocketName, 'send-keys', '-t', testSessionName, 'Enter'])

    await page.reload()
    await page.getByRole('button', { name: testSessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    if (inputMode === 'Live') {
      await page.getByRole('button', { name: 'Live', exact: true }).click()
    }
    await expect(page.locator('.xterm-rows')).toContainText('history-1000')

    const wheelState = await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'display-message',
      '-p',
      '-t',
      testSessionName,
      '#{pane_in_mode}|#{mouse_any_flag}',
    ])
    expect(wheelState.stdout.trim()).toBe('0|0')

    const terminal = page.locator('.xterm-screen')
    const terminalBox = await terminal.boundingBox()
    if (!terminalBox) throw new Error('The terminal has no bounding box.')

    await page.mouse.move(
      terminalBox.x + terminalBox.width / 2,
      terminalBox.y + terminalBox.height / 2,
    )
    const cdp = await page.context().newCDPSession(page)
    const dispatchWheel = () => cdp.send('Input.dispatchMouseEvent', {
      deltaX: 0,
      deltaY: -120,
      type: 'mouseWheel' as const,
      x: terminalBox.x + terminalBox.width / 2,
      y: terminalBox.y + terminalBox.height / 2,
    })
    await Promise.all(Array.from({ length: 12 }, dispatchWheel))

    const mouseFrames = () => sentFrames.filter(frame => inputPayloads([frame])
      .some(payload => /^\u001B\[<6[45];\d+;\d+M$/.test(payload)))
    expect(mouseFrames()).toEqual([])
    const serverErrors = receivedFrames.flatMap((frame) => {
      try {
        const message = JSON.parse(frame) as { type?: string, data?: string }
        return message.type === 'error' ? [message.data ?? 'Unknown terminal error'] : []
      }
      catch {
        return []
      }
    })
    expect(serverErrors).toEqual([])
    await expect.poll(async () => {
      const historyLines: string[] = (await page.locator('.xterm-rows').innerText()).match(/history-\d{4}/g) ?? []
      return historyLines.length > 5 && !historyLines.includes('history-1000')
    }).toBe(true)
    const nativeScrollDirections = sentFrames.flatMap((frame) => {
      try {
        const message = JSON.parse(frame) as { action?: string, payload?: { direction?: string } }
        return message.action === 'scrollPane' ? [message.payload?.direction] : []
      }
      catch {
        return []
      }
    })
    expect(nativeScrollDirections.length).toBeGreaterThan(0)
    expect(nativeScrollDirections.every(direction => direction === 'up')).toBe(true)
    await expect.poll(async () => {
      const result = await execFileAsync('tmux', [
        '-L', configuredSocketName, 'display-message', '-p', '-t', testSessionName,
        '#{pane_in_mode}|#{scroll_position}',
      ])
      return result.stdout.trim()
    }).toMatch(/^1\|[1-9]\d*$/)
    await expect(page.locator('.xterm-viewport')).toHaveCSS('overflow-y', 'hidden')
    const viewportRange = await page.locator('.xterm-viewport').evaluate(viewport => (
      viewport.scrollHeight - viewport.clientHeight
    ))
    expect(viewportRange).toBe(0)

    await expect.poll(async () => {
      const text = await page.locator('.xterm-rows').innerText()
      return text.match(/\[\d+\/\d+\]/g)?.length ?? 0
    }).toBe(0)
  }
  finally {
    await page.request.delete(`/api/sessions/${testSessionName}`).catch(() => undefined)
  }
}

for (const inputMode of ['Async', 'Live'] as const) {
  test(`uses native tmux scrollback without an HTML scrollbar in ${inputMode} mode`, async ({ page }) => {
    await verifyCopyModeScrollRendering(page, inputMode)
  })
}

test('returns to terminal input before submitting an Async message from scrollback', async ({ page }) => {
  const receivedFrames: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', event => receivedFrames.push(String(event.payload)))
  })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: asyncResetSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await execFileAsync('tmux', ['-L', configuredSocketName, 'set-option', '-g', 'mouse', 'on'])
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-l',
      '-t',
      asyncResetSessionName,
      'for i in $(seq 1 1000); do printf "history-%04d\\n" "$i"; done',
    ])
    await execFileAsync('tmux', ['-L', configuredSocketName, 'send-keys', '-t', asyncResetSessionName, 'Enter'])

    await page.reload()
    await page.getByRole('button', { name: asyncResetSessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    const terminalRows = page.locator('.xterm-rows')
    await expect(terminalRows).toContainText('history-1000')

    const terminal = page.locator('.xterm-screen')
    const terminalBox = await terminal.boundingBox()
    if (!terminalBox) throw new Error('The terminal has no bounding box.')
    await page.mouse.move(
      terminalBox.x + terminalBox.width / 2,
      terminalBox.y + terminalBox.height / 2,
    )
    const cdp = await page.context().newCDPSession(page)
    await Promise.all(Array.from({ length: 8 }, () => cdp.send('Input.dispatchMouseEvent', {
      deltaX: 0,
      deltaY: -120,
      type: 'mouseWheel',
      x: terminalBox.x + terminalBox.width / 2,
      y: terminalBox.y + terminalBox.height / 2,
    })))

    await expect.poll(async () => {
      const text = await terminalRows.innerText()
      return !text.includes('history-1000')
    }).toBe(true)
    await expect.poll(async () => {
      const result = await execFileAsync('tmux', [
        '-L',
        configuredSocketName,
        'display-message',
        '-p',
        '-t',
        asyncResetSessionName,
        '#{pane_in_mode}',
      ])
      return result.stdout.trim()
    }).toBe('1')

    const commandInput = page.locator('textarea:not(.xterm-helper-textarea)')
    await commandInput.fill('printf async-scroll-reset-ok')
    await commandInput.press('Control+Enter')

    await expect(terminalRows).toContainText('async-scroll-reset-ok')
    await expect.poll(async () => {
      const result = await execFileAsync('tmux', [
        '-L',
        configuredSocketName,
        'display-message',
        '-p',
        '-t',
        asyncResetSessionName,
        '#{pane_in_mode}',
      ])
      return result.stdout.trim()
    }).toBe('0')
    const serverErrors = receivedFrames.flatMap((frame) => {
      try {
        const message = JSON.parse(frame) as { type?: string, data?: string }
        return message.type === 'error' ? [message.data ?? 'Unknown terminal error'] : []
      }
      catch {
        return []
      }
    })
    expect(serverErrors).toEqual([])
  }
  finally {
    await page.request.delete(`/api/sessions/${asyncResetSessionName}`).catch(() => undefined)
  }
})

test('preserves the terminal scrollback position after visiting Files', async ({ page }) => {
  const receivedFrames: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', event => receivedFrames.push(String(event.payload)))
  })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: viewportSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await execFileAsync('tmux', ['-L', configuredSocketName, 'set-option', '-g', 'mouse', 'on'])
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-l',
      '-t',
      viewportSessionName,
      'for i in $(seq 1 1000); do printf "history-%04d\\n" "$i"; done',
    ])
    await execFileAsync('tmux', ['-L', configuredSocketName, 'send-keys', '-t', viewportSessionName, 'Enter'])

    await page.reload()
    await page.getByRole('button', { name: viewportSessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    const terminalRows = page.locator('.xterm-rows')
    await expect(terminalRows).toContainText('history-1000')
    receivedFrames.length = 0

    const terminal = page.locator('.xterm-screen')
    const terminalBox = await terminal.boundingBox()
    if (!terminalBox) throw new Error('The terminal has no bounding box.')
    await page.mouse.move(
      terminalBox.x + terminalBox.width / 2,
      terminalBox.y + terminalBox.height / 2,
    )
    const cdp = await page.context().newCDPSession(page)
    const wheelEventCount = 8
    await Promise.all(Array.from({ length: wheelEventCount }, () => cdp.send('Input.dispatchMouseEvent', {
      deltaX: 0,
      deltaY: -120,
      type: 'mouseWheel',
      x: terminalBox.x + terminalBox.width / 2,
      y: terminalBox.y + terminalBox.height / 2,
    })))
    const visibleHistoryLines = async (): Promise<string[]> => (
      (await terminalRows.innerText()).match(/history-\d{4}/g) ?? []
    )
    const receivedPaneViewports = (): string[] => receivedFrames.flatMap((raw) => {
      try {
        const message = JSON.parse(raw) as { data?: string, type?: string }
        return message.type === 'stdout' && message.data?.startsWith('\u001B[2J\u001B[3J')
          ? [message.data]
          : []
      }
      catch {
        return []
      }
    })
    let previousViewportCount = -1
    let stableViewportSamples = 0
    await expect.poll(() => {
      const viewportCount = receivedPaneViewports().length
      stableViewportSamples = viewportCount > 0 && viewportCount === previousViewportCount
        ? stableViewportSamples + 1
        : 0
      previousViewportCount = viewportCount
      return stableViewportSamples
    }, { intervals: [250, 250, 250, 250], timeout: 5_000 }).toBeGreaterThanOrEqual(3)
    const linesBeforeFiles = receivedPaneViewports().at(-1)?.match(/history-\d{4}/g)
    if (!linesBeforeFiles || linesBeforeFiles.length <= 5) {
      throw new Error('The final tmux scrollback viewport was not received.')
    }
    expect(linesBeforeFiles).not.toContain('history-1000')
    await expect.poll(visibleHistoryLines).toEqual(linesBeforeFiles)

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await page.getByTitle('Return to Terminal').click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    await expect.poll(visibleHistoryLines).toEqual(linesBeforeFiles)
  }
  finally {
    await page.request.delete(`/api/sessions/${viewportSessionName}`).catch(() => undefined)
  }
})
