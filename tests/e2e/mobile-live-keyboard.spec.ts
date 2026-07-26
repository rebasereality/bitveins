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
    return {
      height: rect.height,
      width: rect.width / sampleLength,
    }
  })
  const start = {
    x: terminalBox.x + metrics.width * 0.5,
    y: terminalBox.y + metrics.height * (startRow + 0.5),
  }
  const end = {
    x: terminalBox.x + metrics.width * (endColumn + 0.5),
    y: terminalBox.y + metrics.height * (endRow + 0.5),
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

    await selectTerminalRange(page, 0, 1, '  service.md:1'.length)
    await expect(openSelection).toBeVisible()
    await openSelection.click()
    await expect(page.getByText(wrappedFileName, { exact: true }).last()).toBeVisible()
  }
  finally {
    await page.request.delete(`/api/sessions/${selectionSessionName}`).catch(() => undefined)
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
