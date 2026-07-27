import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-24)
const sessionName = `draft_${safeRunId}`

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test('preserves an Async draft while Explorer replaces the terminal', async ({ page }) => {
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
    await expect(page.locator('.xterm-screen')).toBeVisible()

    const asyncInput = page.locator('textarea:not(.xterm-helper-textarea)')
    const draft = [
      'Analyse ce problème en profondeur.',
      '',
      '- conserve toutes les contraintes',
      '- ne perds surtout pas ce brouillon',
      '',
      'Puis propose une correction précise.',
    ].join('\n')

    await asyncInput.fill(draft)
    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(page.getByRole('paragraph').filter({ hasText: 'No open files' })).toBeVisible()

    // A hidden prompt must not react to the global Async submit shortcut.
    await page.keyboard.press('Control+Enter')
    await page.getByRole('button', { name: 'Terminal', exact: true }).click()

    await expect(asyncInput).toBeVisible()
    await expect(asyncInput).toHaveValue(draft)
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
