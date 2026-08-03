import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
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

const configuredSocketName: string = socketName
const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)
const sessionName = `window_collision_${safeRunId}`

test('creates a window when the current window name matches its session', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'rename-window',
      '-t',
      `${sessionName}:0`,
      sessionName,
    ])

    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()

    await page.route(`**/api/sessions/${sessionName}/windows`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        body: JSON.stringify({ statusMessage: 'tmux refused the new window' }),
        contentType: 'application/json',
        status: 500,
      })
    }, { times: 1 })
    await page.getByRole('button', { name: 'New tmux window' }).click()
    await expect(page.getByText('tmux refused the new window', { exact: true })).toBeVisible()

    const createResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && response.url().endsWith(`/api/sessions/${sessionName}/windows`),
    )
    await page.getByRole('button', { name: 'New tmux window' }).click()
    expect((await createResponse).ok()).toBe(true)

    await expect(page.getByRole('tab', { name: /^Tmux window 1:/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
