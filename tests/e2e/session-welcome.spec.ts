import { mkdir } from 'node:fs/promises'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const firstSession = `welcome_${safeRunId}_first`
const secondSession = `welcome_${safeRunId}_second`

async function removeFixtureSessions(request: APIRequestContext): Promise<void> {
  await Promise.all([firstSession, secondSession].map(name =>
    request.delete(`/api/sessions/${name}`).catch(() => undefined),
  ))
}

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test('turns the unselected workspace into a session launcher', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await authenticate(page)
  await removeFixtureSessions(page.request)

  try {
    await page.reload()

    const welcome = page.getByRole('region', { name: 'Session welcome' })
    const asyncCommandInput = page.locator('textarea:not(.xterm-helper-textarea)')
    await expect(welcome).toBeVisible()
    await expect(welcome.getByRole('heading', { name: 'Start your first workspace' })).toBeVisible()
    await expect(asyncCommandInput).toBeHidden()

    await welcome.getByRole('button', { name: 'Create your first session' }).click()
    await expect(page.getByRole('heading', { name: 'New tmux session' })).toBeVisible()
    await page.getByLabel('Session name').fill(firstSession)
    await page.getByLabel('Target path').fill(workspace)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(welcome).toBeHidden()

    const createdSecond = await page.request.post('/api/sessions', {
      data: { name: secondSession, path: workspace },
    })
    expect(createdSecond.ok(), await createdSecond.text()).toBe(true)
    await page.reload()

    await expect(welcome.getByRole('heading', { name: 'Pick up where you left off' })).toBeVisible()
    await expect(welcome.getByRole('button', { name: `Open session ${firstSession}` })).toBeVisible()
    await expect(welcome.getByRole('button', { name: `Open session ${secondSession}` })).toBeVisible()

    await welcome.getByRole('button', { name: `Open session ${secondSession}` }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(welcome).toBeHidden()
    await expect(asyncCommandInput).toBeVisible()
  }
  finally {
    await removeFixtureSessions(page.request)
  }
})
