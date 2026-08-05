import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

test('uses the canonical home route as the PWA start URL', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.ok(), await response.text()).toBe(true)

  const manifest = await response.json() as { start_url?: unknown }
  expect(manifest.start_url).toBe('/')
})

test('loads sessions from the previously installed PWA start URL', async ({ page }) => {
  await authenticate(page)
  await page.goto('/?source=pwa')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('region', { name: 'Session welcome' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start your first workspace' })).toBeVisible()
})
