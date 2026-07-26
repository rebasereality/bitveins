import { expect, test } from '@playwright/test'

test.describe('Bitveins E2E Smoke Tests', () => {
  test('renders auth gate or main application page', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveTitle(/Bitveins/i)
  })
})
