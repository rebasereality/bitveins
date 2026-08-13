import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

test('shows compact loading rows instead of a false empty-session state', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  let releaseSessionsRequest: () => void = () => {}
  const sessionsRequestGate = new Promise<void>((resolve) => {
    releaseSessionsRequest = resolve
  })

  await page.route('**/api/sessions', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (route.request().method() === 'GET' && requestUrl.pathname === '/api/sessions') {
      await sessionsRequestGate
    }
    await route.continue()
  })

  await authenticate(page)

  const loading = page.locator('[data-session-loading]')
  await expect(loading).toBeVisible()
  await expect(page.getByText('No tmux sessions', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-session-empty]')).toHaveCount(0)

  const geometry = await loading.evaluate((element) => {
    const rows = [...element.children].map(child => child.getBoundingClientRect())
    return {
      rowCount: rows.length,
      rowHeights: rows.map(row => row.height),
      width: element.getBoundingClientRect().width,
    }
  })
  expect(geometry.rowCount).toBe(3)
  expect(geometry.rowHeights).toEqual([24, 24, 24])
  expect(geometry.width).toBeLessThanOrEqual(240)

  releaseSessionsRequest()

  await expect(loading).toHaveCount(0)
  await expect(page.locator('[data-session-empty]')).toBeVisible()
  await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible()
})
