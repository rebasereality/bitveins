import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const sessionName = `live_order_${safeRunId}`

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test('reorders and persists Live controls with a desktop pointer', async ({ page }) => {
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await page.reload()

    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await page.getByRole('button', { name: 'Live', exact: true }).click()

    const reorder = page.locator('[title="Reorder live controls"]:visible')
    const controls = page.locator('[data-live-control-sortable-item]')
    await expect(reorder).toHaveCount(1)
    await expect(controls).toHaveCount(17)
    await reorder.click()
    await expect(reorder).toHaveAttribute('aria-checked', 'true')

    const before = await controls.locator('button').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('title')),
    )
    await controls.first().dragTo(controls.nth(3))

    await expect.poll(async () => (
      controls.locator('button').evaluateAll(buttons =>
        buttons.map(button => button.getAttribute('title')),
      )
    )).not.toEqual(before)

    const storedOrder = await page.evaluate(() =>
      window.localStorage.getItem('bitveins.liveControls.order.v1'),
    )
    expect(storedOrder).not.toBeNull()
    expect(JSON.parse(storedOrder!)[0]).not.toBe('modifier-ctrl')

    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(page.locator('[data-live-control-sortable-item] button').first())
      .not.toHaveAttribute('title', 'Apply Control to next live key')
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
