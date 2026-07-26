import { expect, type Page } from '@playwright/test'

const password = 'bitveins-e2e-passphrase'

export async function authenticate(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Passphrase').fill(password)
  const loginResponsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Unlock' }).click()
  const loginResponse = await loginResponsePromise
  expect(loginResponse.ok(), await loginResponse.text()).toBe(true)
  await expect.poll(async () => {
    const response = await page.request.get('/api/auth/session')
    return (await response.json() as { authenticated: boolean }).authenticated
  }).toBe(true)
}
