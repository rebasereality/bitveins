import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'
import { ctrlHoverFirstTerminalLink } from './support/terminal-file-link'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const suffix = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const sessionName = `urls_${suffix}`
const targetUrl = 'https://example.test/docs?source=bitveins'
const bareIp = '127.0.0.1:3000'
const normalizedIpUrl = `http://${bareIp}/`

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test.afterAll(async () => {
  await execFileAsync('tmux', ['-L', socketName, 'kill-server']).catch(() => undefined)
})

async function expectTerminalTargetOpensInNewTab(
  context: BrowserContext,
  page: Page,
  terminalText: string,
  expectedUrl: string,
): Promise<void> {
  await context.route(expectedUrl, route => route.fulfill({
    body: '<h1>External documentation</h1>',
    contentType: 'text/html',
    status: 200,
  }))
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await execFileAsync('tmux', [
      '-L', socketName, 'send-keys', '-t', sessionName, '-l', `echo '${terminalText}'`,
    ])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', sessionName, 'Enter'])

    await page.goto('/')
    await page.getByRole('button', { name: `Open session ${sessionName}` }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(ctrlHoverFirstTerminalLink(page)).resolves.toBe(true)

    const originalUrl = page.url()
    const popupPromise = context.waitForEvent('page')
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.up('Control')
    const popup = await popupPromise

    await expect(popup).toHaveURL(expectedUrl)
    await expect(popup.getByRole('heading', { name: 'External documentation' })).toBeVisible()
    expect(page.url()).toBe(originalUrl)
    await popup.close()
  }
  finally {
    await page.keyboard.up('Control').catch(() => undefined)
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
}

test('opens a terminal HTTP URL in a new browser tab on Ctrl+click', async ({ context, page }) => {
  await expectTerminalTargetOpensInNewTab(context, page, targetUrl, targetUrl)
})

test('opens a bare terminal IPv4 address over HTTP in a new browser tab', async ({ context, page }) => {
  await expectTerminalTargetOpensInNewTab(context, page, bareIp, normalizedIpUrl)
})
