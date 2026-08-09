import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { expect, test, type Page } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const execFileAsync = promisify(execFile)
const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-24)
const sessionName = `mobile_${safeRunId}`
const selectionSessionName = `selection_${safeRunId}`
const commandSessionName = `command_${safeRunId}`
const historySessionName = `history_${safeRunId}`
const swipeSessionName = `swipe_${safeRunId}`

async function swipeTerminal(
  page: Page,
  direction: 'down' | 'up',
): Promise<{ preventedMoves: number, wheelDeltas: number[] }> {
  const host = page.locator('[data-terminal-host]')
  const box = await page.locator('.xterm-screen').boundingBox()
  if (!box) throw new Error('The mobile terminal has no bounding box.')
  const x = box.x + box.width / 2
  const distance = box.height * 0.6
  const upperY = box.y + (box.height - distance) / 2
  const lowerY = upperY + distance
  const startY = direction === 'down' ? upperY : lowerY
  const endY = direction === 'down' ? lowerY : upperY
  return await host.evaluate((element, coordinates) => {
    const wheelDeltas: number[] = []
    const recordWheel = (rawEvent: Event) => {
      wheelDeltas.push((rawEvent as WheelEvent).deltaY)
    }
    element.addEventListener('wheel', recordWheel, { capture: true })
    const pointer = {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: coordinates.x,
      clientY: coordinates.startY,
      isPrimary: true,
      pointerId: 7,
      pointerType: 'touch',
    }
    element.dispatchEvent(new PointerEvent('pointerdown', pointer))
    let preventedMoves = 0
    const steps = 10
    for (let step = 1; step <= steps; step += 1) {
      const move = new PointerEvent('pointermove', {
        ...pointer,
        clientY: coordinates.startY
          + (coordinates.endY - coordinates.startY) * (step / steps),
      })
      element.dispatchEvent(move)
      if (move.defaultPrevented) preventedMoves += 1
    }
    element.dispatchEvent(new PointerEvent('pointerup', {
      ...pointer,
      buttons: 0,
      clientY: coordinates.endY,
    }))
    element.removeEventListener('wheel', recordWheel, { capture: true })
    return { preventedMoves, wheelDeltas }
  }, {
    endY,
    startY,
    x,
  })
}

async function selectTerminalRange(
  page: Page,
  startRow: number,
  endRow: number,
  endColumn: number,
): Promise<void> {
  const host = page.locator('[data-terminal-host]')
  const terminalBox = await page.locator('.xterm-screen').boundingBox()
  if (!terminalBox) throw new Error('The mobile terminal has no bounding box.')

  const metrics = await page.locator('.xterm-char-measure-element').first().evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const sampleLength = element.textContent?.length || 1
    return { width: rect.width / sampleLength }
  })
  const terminalRows = page.locator('.xterm-rows > div')
  const [startRowBox, endRowBox] = await Promise.all([
    terminalRows.nth(startRow).boundingBox(),
    terminalRows.nth(endRow).boundingBox(),
  ])
  if (!startRowBox || !endRowBox) {
    throw new Error('The selected mobile terminal rows have no bounding boxes.')
  }
  const start = {
    x: terminalBox.x + metrics.width * 0.5,
    y: startRowBox.y + startRowBox.height / 2,
  }
  const end = {
    x: terminalBox.x + metrics.width * (endColumn + 0.5),
    y: endRowBox.y + endRowBox.height / 2,
  }
  const pointer = {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  }

  await host.dispatchEvent('pointerdown', pointer)
  await expect(page.locator('[data-select-toolbar]')).toBeVisible()
  await host.dispatchEvent('pointermove', {
    ...pointer,
    clientX: end.x,
    clientY: end.y,
  })
  await host.dispatchEvent('pointerup', {
    ...pointer,
    buttons: 0,
    clientX: end.x,
    clientY: end.y,
  })

  await expect(page.getByTitle('Copy selection')).toBeEnabled()
}

function selectTerminalRow(page: Page, row: number, length: number): Promise<void> {
  return selectTerminalRange(page, row, row, length)
}

test('opens the mobile Live keyboard only from its explicit toggle', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
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
    await page.getByLabel('Open sessions').click()
    const sessionsDrawer = page.locator('.bitveins-mobile-sessions-drawer')
    await expect(sessionsDrawer).toBeVisible()
    const drawerWidth = await sessionsDrawer.evaluate(
      element => element.getBoundingClientRect().width,
    )
    expect(drawerWidth).toBeGreaterThan(300)
    expect(drawerWidth).toBeCloseTo(Math.min((page.viewportSize()?.width || 0) * 0.88, 352), 0)
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(page.locator('.xterm-screen')).toBeVisible()

    await page.getByRole('button', { name: 'Live', exact: true }).click()

    const keyboardInput = page.getByLabel('Live terminal keyboard')
    const xtermInput = page.locator('.xterm-helper-textarea')
    const isKeyboardInputFocused = () => keyboardInput.evaluate(
      element => document.activeElement === element,
    )

    await expect(xtermInput).toHaveAttribute('inputmode', 'none')
    await expect.poll(isKeyboardInputFocused).toBe(false)

    await page.getByRole('button', { name: 'CTRL', exact: true }).tap()
    await expect.poll(isKeyboardInputFocused).toBe(false)

    const openKeyboard = page.getByRole('button', { name: 'Open keyboard' })
    await expect(openKeyboard).toHaveAttribute('aria-pressed', 'false')
    await openKeyboard.click()

    await expect.poll(isKeyboardInputFocused).toBe(true)
    const hideKeyboard = page.getByRole('button', { name: 'Hide keyboard' })
    await expect(hideKeyboard).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'CTRL', exact: true }).tap()

    const terminalSnapshot = async () => {
      const response = await page.request.get(
        `/api/sessions/${sessionName}/windows/0/snapshot`,
      )
      return (await response.json() as { data: string }).data
    }

    await page.keyboard.insertText('zxq')
    await expect.poll(terminalSnapshot).toContain('zxq')
    await page.keyboard.press('Backspace')
    await expect.poll(terminalSnapshot).not.toContain('zxq')
    await expect.poll(terminalSnapshot).toContain('zx')

    await page.getByTitle('Control C').tap()
    const enterMarkerPath = `${workspace}/gboard-enter-ok`
    await page.keyboard.insertText(`touch ${enterMarkerPath}`)
    await page.keyboard.press('Enter')
    await expect.poll(async () => {
      try {
        await stat(enterMarkerPath)
        return true
      }
      catch {
        return false
      }
    }).toBe(true)

    await page.getByRole('button', { name: 'SHIFT', exact: true }).tap()
    await expect.poll(isKeyboardInputFocused).toBe(true)

    await hideKeyboard.click()
    await expect.poll(isKeyboardInputFocused).toBe(false)
    await expect(page.getByRole('button', { name: 'Open keyboard' }))
      .toHaveAttribute('aria-pressed', 'false')

    await page.locator('.xterm-screen').click({ position: { x: 20, y: 20 } })
    await expect.poll(isKeyboardInputFocused).toBe(false)
    await expect(xtermInput).toHaveAttribute('inputmode', 'none')
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})

test('shows the Explorer action after consecutive mobile terminal selections', async ({ page }) => {
  const wrappedDirectory = `${workspace}/docs/plans`
  const wrappedFileName = '2026-07-24-refonte-ecran-service.md'
  await mkdir(wrappedDirectory, { recursive: true })
  await Promise.all([
    writeFile(`${workspace}/first.txt`, 'first\n'),
    writeFile(`${workspace}/second.txt`, 'second\n'),
    writeFile(`${wrappedDirectory}/${wrappedFileName}`, '# wrapped path\n'),
  ])
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: selectionSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await execFileAsync('tmux', [
      '-L',
      socketName,
      'send-keys',
      '-t',
      selectionSessionName,
      'PS1=\'\'',
      'Enter',
    ])

    await page.reload()
    await page.getByLabel('Open sessions').click()
    await page.getByRole('button', { name: selectionSessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    await execFileAsync('tmux', [
      '-L',
      socketName,
      'send-keys',
      '-t',
      selectionSessionName,
      'printf \'\\033[2J\\033[Hfirst.txt\\nsecond.txt\\n\'',
      'Enter',
    ])
    await expect.poll(async () => {
      const response = await page.request.get(
        `/api/sessions/${selectionSessionName}/windows/0/snapshot`,
      )
      return (await response.json() as { data: string }).data
    }).toContain('second.txt')
    await expect(page.locator('.xterm-rows')).toContainText('second.txt')

    const openSelection = page.getByTitle('Open selected path in Explorer')
    await selectTerminalRow(page, 0, 'first.txt'.length)
    await expect(openSelection).toBeVisible()
    await openSelection.click()
    await expect(page.getByText('first.txt', { exact: true }).last()).toBeVisible()

    await page.getByTitle('Return to Terminal').click()
    await selectTerminalRow(page, 1, 'second.txt'.length)
    await expect(openSelection).toBeVisible()
    await openSelection.click()
    await expect(page.getByText('second.txt', { exact: true }).last()).toBeVisible()

    await page.getByTitle('Return to Terminal').click()
    await execFileAsync('tmux', [
      '-L',
      socketName,
      'send-keys',
      '-t',
      selectionSessionName,
      `printf '\\033[2J\\033[Hdocs/plans/2026-07-24-refonte-ecran-\\n  service.md:1\\n'`,
      'Enter',
    ])
    await expect.poll(async () => {
      const response = await page.request.get(
        `/api/sessions/${selectionSessionName}/windows/0/snapshot`,
      )
      return (await response.json() as { data: string }).data
    }).toContain('service.md:1')
    await expect(page.locator('.xterm-rows')).toContainText('service.md:1')

    const findWrappedPathRows = async () => {
      const rows = await page.locator('.xterm-rows > div').allTextContents()
      const startRow = rows.lastIndexOf('docs/plans/2026-07-24-refonte-ecran-')
      const endRow = rows.indexOf('  service.md:1', startRow + 1)
      return { endRow, startRow }
    }
    await expect.poll(async () => {
      const rows = await findWrappedPathRows()
      return rows.startRow >= 0 && rows.endRow === rows.startRow + 1
    }).toBe(true)
    const wrappedPathRows = await findWrappedPathRows()

    await selectTerminalRange(
      page,
      wrappedPathRows.startRow,
      wrappedPathRows.endRow,
      '  service.md:1'.length,
    )
    await expect(openSelection).toBeVisible()
    await openSelection.click()
    await expect(page.getByText(wrappedFileName, { exact: true }).last()).toBeVisible()
  }
  finally {
    await page.request.delete(`/api/sessions/${selectionSessionName}`).catch(() => undefined)
  }
})

test('routes natural one-finger swipes with and without tmux mouse tracking', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: swipeSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await execFileAsync('tmux', [
      '-L',
      socketName,
      'set-option',
      '-t',
      swipeSessionName,
      'mouse',
      'off',
    ])

    await page.reload()
    await page.getByLabel('Open sessions').click()
    await page.getByRole('button', { name: swipeSessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    const host = page.locator('[data-terminal-host]')
    await expect(host).toHaveCSS('touch-action', 'pan-x pinch-zoom')

    await execFileAsync('tmux', [
      '-L',
      socketName,
      'send-keys',
      '-t',
      swipeSessionName,
      `printf '\\033[2J\\033[H'; seq -f 'swipe-line-%03g' 1 120`,
      'Enter',
    ])
    const renderedRows = page.locator('.xterm-rows')
    await expect(renderedRows).toContainText('swipe-line-120')

    const untrackedDown = await swipeTerminal(page, 'down')
    const untrackedUp = await swipeTerminal(page, 'up')
    expect(untrackedDown.preventedMoves).toBeGreaterThan(0)
    expect(untrackedUp.preventedMoves).toBeGreaterThan(0)
    expect(untrackedDown.wheelDeltas.length).toBeGreaterThan(0)
    expect(untrackedDown.wheelDeltas.every(delta => delta === -1)).toBe(true)
    expect(untrackedUp.wheelDeltas.length).toBeGreaterThan(0)
    expect(untrackedUp.wheelDeltas.every(delta => delta === 1)).toBe(true)

    await execFileAsync('tmux', [
      '-L',
      socketName,
      'set-option',
      '-t',
      swipeSessionName,
      'mouse',
      'on',
    ])
    await expect(page.locator('.xterm')).toHaveClass(/enable-mouse-events/)
    const tmuxDown = await swipeTerminal(page, 'down')
    const tmuxUp = await swipeTerminal(page, 'up')
    expect(tmuxDown.preventedMoves).toBeGreaterThan(0)
    expect(tmuxUp.preventedMoves).toBeGreaterThan(0)
    expect(tmuxDown.wheelDeltas.length).toBeGreaterThan(0)
    expect(tmuxDown.wheelDeltas.every(delta => delta === -1)).toBe(true)
    expect(tmuxUp.wheelDeltas.length).toBeGreaterThan(0)
    expect(tmuxUp.wheelDeltas.every(delta => delta === 1)).toBe(true)
    await swipeTerminal(page, 'down')
    await expect(renderedRows).not.toContainText('swipe-line-120')
    await swipeTerminal(page, 'up')
    await expect(renderedRows).toContainText('swipe-line-120')
  }
  finally {
    await page.request.delete(`/api/sessions/${swipeSessionName}`).catch(() => undefined)
  }
})

test('opens a blank Async drawer for each tmux conversation and keeps Files compact', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: commandSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await page.reload()
    await page.getByLabel('Open sessions').click()
    await page.getByRole('button', { name: commandSessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    const filesButton = page.getByRole('button', { name: 'Files', exact: true })
    await expect(filesButton).toBeVisible()

    const openCommandDrawer = page.locator('input[readonly][placeholder^="Type command"]')
    await openCommandDrawer.click()
    const commandTextarea = page.locator('textarea[placeholder^="Type command"]:visible')
    await commandTextarea.fill('prompt from the first tmux conversation')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByTitle('New tmux window').click()
    await expect(page.getByRole('tab', { name: /^Tmux window 1:/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await openCommandDrawer.click()
    await expect(commandTextarea).toHaveValue('')
  }
  finally {
    await page.request.delete(`/api/sessions/${commandSessionName}`).catch(() => undefined)
  }
})

test('commits a selected history message when the mobile Async textarea is tapped', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: historySessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await page.reload()
    await page.getByLabel('Open sessions').click()
    await page.getByRole('button', { name: historySessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    const command = 'printf mobile-history-probe'
    const openCommandDrawer = page.locator('input[readonly][placeholder^="Type command"]')
    await openCommandDrawer.click()
    const commandTextarea = page.locator('textarea:not(.xterm-helper-textarea):visible')
    await commandTextarea.fill(command)

    const historySaved = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && response.url().includes(`/api/sessions/${historySessionName}/history`),
    )
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    expect((await historySaved).status()).toBe(201)

    await openCommandDrawer.click()
    await page.getByTitle('Previous message (History Up)').tap()
    await expect(commandTextarea).toHaveAttribute('placeholder', command)
    await commandTextarea.tap()

    await expect(commandTextarea).toHaveValue(command)
  }
  finally {
    await page.request.delete(`/api/sessions/${historySessionName}`).catch(() => undefined)
  }
})
