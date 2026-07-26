import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type Page, type Route } from '@playwright/test'
import { authenticate } from './support/authenticate'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)
const sourceSession = `transfer_source_${safeRunId}`
const overlaySession = `transfer_overlay_${safeRunId}`
const transferRoot = join(workspace, 'transfer-root')
const uploadRoot = join(workspace, 'uploads')
const promptUploadRoot = `/tmp/bitveins/${overlaySession}`

function dispatchFileDrag(
  page: Page,
  target: 'window' | string,
  type: 'dragenter' | 'drop',
  file?: { content: string, name: string },
): Promise<unknown> {
  return page.evaluate(({ file, target, type }) => {
    const transfer = new DataTransfer()
    const draggedFile = file ?? { content: '', name: 'drag-probe.txt' }
    transfer.items.add(new File(
      [draggedFile.content],
      draggedFile.name,
      { type: 'text/plain' },
    ))
    const event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    })
    if (target === 'window') return window.dispatchEvent(event)
    const element = document.querySelector(target)
    if (!element) throw new Error(`Missing drag target ${target}`)
    return element.dispatchEvent(event)
  }, { file, target, type })
}

async function saveDropzones(page: Page, dropzones: Array<{ name: string, path: string }>) {
  const response = await page.request.post('/api/dropzones', {
    data: { dropzones },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeAll(async () => {
  await mkdir(transferRoot, { recursive: true })
  await mkdir(uploadRoot, { recursive: true })
  await writeFile(join(transferRoot, 'transfer-marker.txt'), 'transfer root\n')
})

test('opens a Transfer in a dedicated tmux session and Explorer without typing cd', async ({ page }) => {
  const sentFrames: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framesent', event => sentFrames.push(String(event.payload)))
  })
  await authenticate(page)

  try {
    const source = await page.request.post('/api/sessions', {
      data: { name: sourceSession, path: workspace },
    })
    expect(source.ok(), await source.text()).toBe(true)
    await saveDropzones(page, [{
      name: 'Dépôt Documentation',
      path: transferRoot,
    }])

    await page.reload()
    await page.getByRole('button', { name: sourceSession, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    sentFrames.length = 0

    await page.getByRole('button', { name: 'Transfers', exact: true }).click()
    const openResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/transfers/open')
      && response.request().method() === 'POST',
    )
    await page.getByRole('menuitem', { name: /Dépôt Documentation/ }).click()
    expect((await openResponse).status()).toBe(201)

    await expect(page.getByText('transfer-marker.txt', { exact: true })).toBeVisible()
    await expect(page.getByText('No open files', { exact: true }).last()).toBeVisible()
    await expect(page.getByRole('button', {
      exact: true,
      name: 'depot-documentation',
    })).toBeVisible()

    const pane = await execFileAsync('tmux', [
      '-L',
      socketName,
      'display-message',
      '-p',
      '-t',
      'depot-documentation:0.0',
      '#{pane_current_path}',
    ])
    expect(pane.stdout.trim()).toBe(transferRoot)
    expect(sentFrames.some((raw) => {
      try {
        const message = JSON.parse(raw) as {
          action?: string
          payload?: { data?: string }
        }
        return (message.action === 'input' || message.action === 'reliableInput')
          && Boolean(message.payload?.data?.includes('cd '))
      }
      catch {
        return false
      }
    })).toBe(false)

    await dispatchFileDrag(page, 'window', 'dragenter')
    await expect(page.getByRole('group', { name: 'Current prompt' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Transfer to Dépôt Documentation' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Transfers', exact: true }).click()
    const reuseResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/transfers/open')
      && response.request().method() === 'POST',
    )
    await page.getByRole('menuitem', { name: /Dépôt Documentation/ }).click()
    expect((await reuseResponse).status()).toBe(200)

    const sessions = await page.request.get('/api/sessions')
    const sessionNames = (await sessions.json() as {
      sessions: Array<{ name: string }>
    }).sessions.map(session => session.name)
    expect(sessionNames.filter(name => name === 'depot-documentation')).toHaveLength(1)
  }
  finally {
    await saveDropzones(page, []).catch(() => undefined)
    await page.request.delete('/api/sessions/depot-documentation').catch(() => undefined)
    await page.request.delete(`/api/sessions/${sourceSession}`).catch(() => undefined)
  }
})

test('shows the balanced global grid and uploads to a Transfer or Current prompt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await authenticate(page)
  const dropzones = [
    { name: 'One', path: uploadRoot },
    { name: 'Two', path: uploadRoot },
    { name: 'Three', path: uploadRoot },
    { name: 'Four', path: uploadRoot },
    { name: 'Five', path: uploadRoot },
  ]

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: overlaySession, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await saveDropzones(page, dropzones)

    await page.reload()
    await page.getByRole('button', { name: overlaySession, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    await dispatchFileDrag(page, 'window', 'dragenter')
    const overlay = page.locator('[data-global-transfer-overlay]')
    await expect(overlay).toBeVisible()
    const rows = overlay.locator('[data-transfer-destination-row]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('[data-transfer-drop-target]')).toHaveCount(3)
    await expect(rows.nth(1).locator('[data-transfer-drop-target]')).toHaveCount(2)
    await expect(overlay).toHaveCSS('opacity', '1')

    const transferTarget = page.getByRole('group', { name: 'Transfer to Three' })
    const restingSurface = await transferTarget.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        backdropFilter: style.backdropFilter,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
      }
    })
    expect(restingSurface.backdropFilter).toContain('blur(')
    expect(restingSurface.boxShadow).not.toBe('none')

    await dispatchFileDrag(page, '[aria-label="Transfer to Three"]', 'dragenter')
    await expect(transferTarget).toHaveAttribute('data-drop-active', 'true')
    await expect(transferTarget).toContainText('Release to transfer')
    const activeSurface = await transferTarget.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
      }
    })
    expect(activeSurface.borderColor).not.toBe(restingSurface.borderColor)
    expect(activeSurface.boxShadow).not.toBe(restingSurface.boxShadow)

    const overlayBox = await overlay.boundingBox()
    const promptBox = await page.getByRole('group', { name: 'Current prompt' }).boundingBox()
    expect(overlayBox).not.toBeNull()
    expect(promptBox).not.toBeNull()
    expect(promptBox!.height / overlayBox!.height).toBeCloseTo(1 / 3, 1)

    let releaseTransferUpload = (): void => {}
    const transferUploadGate = new Promise<void>((resolve) => {
      releaseTransferUpload = resolve
    })
    const holdTransferUpload = async (route: Route): Promise<void> => {
      await transferUploadGate
      await route.continue()
    }
    await page.route('**/api/upload', holdTransferUpload)

    try {
      const transferUploadResponse = page.waitForResponse(response =>
        response.url().endsWith('/api/upload')
        && response.request().method() === 'POST',
      )
      await dispatchFileDrag(page, '[aria-label="Transfer to Three"]', 'drop', {
        content: 'uploaded to Transfer\n',
        name: 'transfer-upload.txt',
      })

      const uploadDialog = page.getByRole('dialog')
      await expect(uploadDialog).toBeVisible()
      await expect(uploadDialog).toContainText('Transferring file...')
      await expect(uploadDialog).toContainText('Uploading to Three')
      await expect(uploadDialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

      releaseTransferUpload()
      expect((await transferUploadResponse).ok()).toBe(true)
      await expect(uploadDialog).toContainText('Transfer complete')
      await expect(uploadDialog).toContainText('Uploaded to Three')
    }
    finally {
      releaseTransferUpload()
      await page.unroute('**/api/upload', holdTransferUpload)
    }

    await expect.poll(async () => readFile(
      join(uploadRoot, 'transfer-upload.txt'),
      'utf8',
    ).catch(() => '')).toBe('uploaded to Transfer\n')
    await expect(overlay).toHaveCount(0)

    await dispatchFileDrag(page, 'window', 'dragenter')
    const promptUploadResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/upload')
      && response.request().method() === 'POST',
    )
    await dispatchFileDrag(page, '[aria-label="Current prompt"]', 'drop', {
      content: 'uploaded to prompt\n',
      name: 'prompt-upload.txt',
    })
    expect((await promptUploadResponse).ok()).toBe(true)

    const asyncInput = page.locator('textarea:not(.xterm-helper-textarea)')
    await expect(asyncInput).toHaveValue(
      new RegExp(`/tmp/bitveins/${overlaySession}/[^/]+/prompt-upload\\.txt`),
    )
  }
  finally {
    await saveDropzones(page, []).catch(() => undefined)
    await page.request.delete(`/api/sessions/${overlaySession}`).catch(() => undefined)
    await rm(join(uploadRoot, 'transfer-upload.txt'), { force: true })
    await rm(promptUploadRoot, { force: true, recursive: true })
  }
})
