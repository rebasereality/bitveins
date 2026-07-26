import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { MAX_INPUT_BYTES } from '../../shared/contracts/terminal'
import { authenticate } from './support/authenticate'
import { ctrlHoverFirstTerminalLink } from './support/terminal-file-link'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-24)
const migrationSessionName = `migration_${safeRunId}`
const initialName = `e2e_${safeRunId}`
const renamedName = `${initialName}_renamed`
const uiSessionName = `ui_${safeRunId}`
const explorerSessionName = `explorer_${safeRunId}`
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function reliablePayloads(frames: readonly string[]): string[] {
  return frames.flatMap((raw) => {
    try {
      const message = JSON.parse(raw) as {
        action?: string
        payload?: { data?: string }
      }
      return message.action === 'reliableInput' && typeof message.payload?.data === 'string'
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

test('migrates the legacy IDE preference to Explorer', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bitveins.viewMode', 'ide')
  })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: migrationSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await page.reload()

    await expect.poll(() => page.evaluate(
      () => window.localStorage.getItem('bitveins.viewMode'),
    )).toBe('explorer')
    await page.getByRole('button', { name: `Open session ${migrationSessionName}` }).click()
    await expect(page.locator('p').filter({ hasText: 'No open files' })).toBeVisible()
  }
  finally {
    await page.request.delete(`/api/sessions/${migrationSessionName}`).catch(() => undefined)
  }
})

test('authenticates and completes a session lifecycle on an isolated tmux socket', async ({ page }) => {
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: initialName,
        path: workspace,
      },
    })
    expect(created.ok()).toBe(true)
    expect(await created.json()).toMatchObject({
      session: {
        name: initialName,
        path: workspace,
      },
    })

    const renamed = await page.request.patch(`/api/sessions/${initialName}`, {
      data: { name: renamedName },
    })
    expect(renamed.ok()).toBe(true)
    expect(await renamed.json()).toMatchObject({
      session: { name: renamedName },
    })

    const listed = await execFileAsync('tmux', [
      '-L',
      socketName,
      'list-sessions',
      '-F',
      '#{session_name}',
    ])
    expect(listed.stdout.trim().split('\n')).toContain(renamedName)

    const attachment = await page.evaluate(async (sessionName) => {
      const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ws`

      return await new Promise<{ sessionName: string, type: string }>((resolve, reject) => {
        const socket = new WebSocket(url)
        const timeout = window.setTimeout(() => {
          socket.close()
          reject(new Error('Timed out waiting for terminal attachment.'))
        }, 10_000)

        socket.addEventListener('open', () => {
          socket.send(JSON.stringify({
            action: 'attach',
            payload: {
              cols: 80,
              rows: 24,
              sessionName,
            },
          }))
        })
        socket.addEventListener('message', (event) => {
          const message = JSON.parse(String(event.data)) as {
            data: string
            sessionName?: string
            type: string
          }
          if (message.type === 'error') {
            window.clearTimeout(timeout)
            socket.close()
            reject(new Error(message.data))
          }
          if (message.type === 'attached' && message.sessionName) {
            window.clearTimeout(timeout)
            socket.send(JSON.stringify({ action: 'detach' }))
            socket.close()
            resolve({
              sessionName: message.sessionName,
              type: message.type,
            })
          }
        })
        socket.addEventListener('error', () => {
          window.clearTimeout(timeout)
          reject(new Error('WebSocket attachment failed.'))
        })
      })
    }, renamedName)
    expect(attachment).toEqual({
      sessionName: renamedName,
      type: 'attached',
    })

    const deleted = await page.request.delete(`/api/sessions/${renamedName}`)
    expect(deleted.ok()).toBe(true)
    await expect(execFileAsync('tmux', [
      '-L',
      socketName,
      'has-session',
      '-t',
      renamedName,
    ])).rejects.toBeDefined()
  }
  finally {
    await page.request.delete(`/api/sessions/${renamedName}`).catch(() => undefined)
    await page.request.delete(`/api/sessions/${initialName}`).catch(() => undefined)
  }
})

test('serializes async submissions, skips oversized prompts, and keeps light menus readable', async ({ page }) => {
  const sentFrames: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framesent', event => sentFrames.push(String(event.payload)))
  })

  await writeFile(join(workspace, 'menu-probe.txt'), 'context menu probe\n')
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: uiSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: uiSessionName, exact: true }).click()
    await expect(page.locator('.xterm-screen')).toBeVisible()

    const asyncInput = page.locator('textarea:not(.xterm-helper-textarea)')
    const shortPrompt = 'Impressionnant. Tu peux commit/push'
    await asyncInput.fill(shortPrompt)
    await asyncInput.press('Control+Enter')
    await expect.poll(() => reliablePayloads(sentFrames)).toEqual([shortPrompt, '\r'])

    sentFrames.length = 0
    const longPrompt = 'L'.repeat(81)
    await asyncInput.fill(longPrompt)
    await asyncInput.press('Control+Enter')
    await expect.poll(() => reliablePayloads(sentFrames)).toEqual([longPrompt, '\r'])
    await expect.poll(() => page.evaluate(
      () => window.sessionStorage.getItem('bitveins.reliable-input-outbox.v1'),
    )).toBeNull()

    sentFrames.length = 0
    const oversizedPrompt = 'O'.repeat(MAX_INPUT_BYTES + 1)
    const oversizedHistory = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && response.url().includes(`/api/sessions/${uiSessionName}/history`),
    )
    await asyncInput.fill(oversizedPrompt)
    await asyncInput.press('Control+Enter')

    const oversizedHistoryResponse = await oversizedHistory
    expect(oversizedHistoryResponse.status()).toBe(201)
    expect(await page.evaluate(prompt => Object.entries(localStorage).some(
      ([key, value]) => key.startsWith('bitveins_async_submitted_') && value === prompt,
    ), oversizedPrompt)).toBe(true)
    expect(await page.evaluate(
      () => window.sessionStorage.getItem('bitveins.reliable-input-outbox.v1'),
    )).toBeNull()

    const followingPrompt = 'This prompt must not be blocked'
    await asyncInput.fill(followingPrompt)
    await asyncInput.press('Control+Enter')
    await expect.poll(() => reliablePayloads(sentFrames)).toEqual([followingPrompt, '\r'])

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    const probeFile = page.getByText('menu-probe.txt', { exact: true })
    await expect(probeFile).toBeVisible()
    await probeFile.click({ button: 'right' })

    const menuButton = page.getByRole('button', { name: 'Open file', exact: true })
    await expect(menuButton).toBeVisible()
    const colors = await menuButton.evaluate((element) => {
      const button = getComputedStyle(element)
      const menu = getComputedStyle(element.parentElement!)
      return {
        button: button.color,
        menu: menu.backgroundColor,
      }
    })
    expect(colors).toEqual({
      button: 'rgb(36, 38, 43)',
      menu: 'rgb(255, 255, 255)',
    })
  }
  finally {
    await page.request.delete(`/api/sessions/${uiSessionName}`).catch(() => undefined)
  }
})

test('opens an ambiguous terminal image path in Explorer and manages its remembered root', async ({ page, request }) => {
  const receivedFrames: string[] = []
  const linkResolutionRequests: Array<{
    body: string | null
    url: string
  }> = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', event => receivedFrames.push(String(event.payload)))
  })
  page.on('request', (pageRequest) => {
    if (pageRequest.url().includes('/files/resolve')) {
      linkResolutionRequests.push({
        body: pageRequest.postData(),
        url: pageRequest.url(),
      })
    }
  })
  for (const project of ['project-one', 'project-two']) {
    const projectRoot = join(workspace, project)
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(join(projectRoot, 'package.json'), '{}')
    await writeFile(join(projectRoot, 'src/preview.png'), onePixelPng)
  }
  const unauthenticatedImage = await request.get(
    `/api/sessions/${explorerSessionName}/files/image`,
    { params: { path: 'project-one/src/preview.png' } },
  )
  expect(unauthenticatedImage.status()).toBe(401)
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: {
        name: explorerSessionName,
        path: workspace,
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await execFileAsync('tmux', [
      '-L',
      socketName,
      'send-keys',
      '-t',
      explorerSessionName,
      'PS1=\'\'',
      'Enter',
    ])
    const paneBeforeAttach = await execFileAsync('tmux', [
      '-L',
      socketName,
      'list-panes',
      '-t',
      explorerSessionName,
      '-F',
      '#{pane_dead}|#{pane_current_command}',
    ])
    expect(paneBeforeAttach.stdout.trim()).toMatch(/^0\|/)

    const imageResponse = await page.request.get(
      `/api/sessions/${explorerSessionName}/files/image`,
      { params: { path: 'project-one/src/preview.png' } },
    )
    expect(imageResponse.ok()).toBe(true)
    expect(imageResponse.headers()).toMatchObject({
      'cache-control': 'private, no-store',
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
    })
    const escaped = await page.request.get(
      `/api/sessions/${explorerSessionName}/files/metadata`,
      { params: { path: '../outside.png' } },
    )
    expect(escaped.status()).toBe(403)

    await page.reload()
    await page.getByRole('button', { name: explorerSessionName, exact: true }).click()
    await expect(page.locator('.xterm-screen')).toBeVisible()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    const windowsResponse = await page.request.get(`/api/sessions/${explorerSessionName}/windows`)
    expect(windowsResponse.ok(), await windowsResponse.text()).toBe(true)
    const windows = await windowsResponse.json() as { windows: Array<{ id: string }> }
    const resolutionResponse = await page.request.post(
      `/api/sessions/${explorerSessionName}/files/resolve`,
      {
        data: {
          windowId: windows.windows[0]!.id,
          references: [{ path: 'src/preview.png' }],
        },
      },
    )
    expect(resolutionResponse.ok(), await resolutionResponse.text()).toBe(true)
    expect(await resolutionResponse.json()).toMatchObject({
      resolutions: [{ status: 'ambiguous' }],
    })

    const asyncInput = page.locator('textarea:not(.xterm-helper-textarea)')
    await asyncInput.fill('printf \'%s\\n\' src/preview.png')
    await asyncInput.press('Control+Enter')
    const paneAfterCommand = await execFileAsync('tmux', [
      '-L',
      socketName,
      'list-panes',
      '-t',
      explorerSessionName,
      '-F',
      '#{pane_dead}|#{pane_current_command}',
    ])
    expect(paneAfterCommand.stdout.trim()).toMatch(/^0\|/)
    const snapshot = await page.request.get(
      `/api/sessions/${explorerSessionName}/windows/0/snapshot`,
    )
    expect(snapshot.ok(), await snapshot.text()).toBe(true)
    expect(await snapshot.json()).toMatchObject({
      data: expect.stringContaining('src/preview.png'),
    })
    await page.waitForTimeout(500)
    const terminalFailures = receivedFrames.flatMap((raw) => {
      try {
        const message = JSON.parse(raw) as { data?: string, type?: string }
        return message.type === 'error' || message.type === 'status' ? [message] : []
      }
      catch {
        return []
      }
    })
    expect(terminalFailures).toEqual([])
    const terminalOutput = receivedFrames.flatMap((raw) => {
      try {
        const message = JSON.parse(raw) as { data?: string, type?: string }
        return message.type === 'stdout' && message.data ? [message.data] : []
      }
      catch {
        return []
      }
    }).join('')
    expect(terminalOutput).toContain('src/preview.png')

    const foundTerminalLink = await ctrlHoverFirstTerminalLink(
      page,
      () => linkResolutionRequests.length,
    )
    expect(
      foundTerminalLink,
      `File-link resolver requests: ${JSON.stringify(linkResolutionRequests)}`,
    ).toBe(true)
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.up('Control')

    await expect(page.getByRole('heading', { name: 'Choose the project root' })).toBeVisible()
    await expect(page.getByLabel('Remember this root for this tmux window')).not.toBeChecked()
    await page.getByRole('button')
      .filter({ hasText: 'Root: project-two' })
      .click()

    await expect(page.getByRole('img', { name: 'preview.png' })).toBeVisible()
    await expect(page.getByText('project-two/src/preview.png', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Terminal', exact: true }).click()
    await page.getByTitle('More terminal actions').click()
    await expect(page.getByText('No root remembered for this window', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    const foundTerminalLinkAgain = await ctrlHoverFirstTerminalLink(
      page,
      () => linkResolutionRequests.length,
    )
    expect(foundTerminalLinkAgain).toBe(true)
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.up('Control')

    await expect(page.getByRole('heading', { name: 'Choose the project root' })).toBeVisible()
    await page.getByLabel('Remember this root for this tmux window').check()
    await page.getByRole('button')
      .filter({ hasText: 'Root: project-one' })
      .click()

    await expect(page.getByRole('img', { name: 'preview.png' })).toBeVisible()
    await expect(page.getByText('project-one/src/preview.png', { exact: true })).toBeVisible()
    await page.getByTitle('Zoom in').click()
    await expect(page.getByText('125%', { exact: true })).toBeVisible()

    await page.getByText('project-one', { exact: true }).click()
    await page.getByText('package.json', { exact: true }).dblclick()
    await expect(page.getByRole('img', { name: 'preview.png' })).toBeHidden()
    await page.locator('[data-explorer-tab]')
      .filter({ hasText: 'preview.png' })
      .last()
      .click()
    await expect(page.getByRole('img', { name: 'preview.png' })).toBeVisible()

    await page.getByRole('button', { name: 'Terminal', exact: true }).click()
    await expect(page.locator('.xterm-screen')).toBeVisible()
    await page.getByTitle('More terminal actions').click()
    await expect(page.getByText('Current: project-one', { exact: true })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Forget current root' }).click()
    await page.getByTitle('More terminal actions').click()
    await expect(page.getByText('No root remembered for this window', { exact: true })).toBeVisible()
  }
  finally {
    await page.keyboard.up('Control').catch(() => undefined)
    await page.request.delete(`/api/sessions/${explorerSessionName}`).catch(() => undefined)
  }
})
