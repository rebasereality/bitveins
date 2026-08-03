import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

test('shows an unavailable deep-link target without opening the sessions drawer', async ({ page }) => {
  await authenticate(page)

  const eventResponse = await page.request.post('/api/attention', {
    data: {
      sessionName: '_bitveins_legacy_mobile_helper',
      source: 'test-agent',
      title: 'Legacy mobile helper target',
      type: 'information',
      windowId: '@1',
    },
  })
  expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
  const { event } = await eventResponse.json() as { event: { id: string } }

  await page.getByLabel('Open Agent Inbox').click()
  await page.locator(`[data-event-id="${event.id}"]`).click()

  await expect(page.locator('main > div.fixed').filter({
    hasText: 'The linked tmux session is no longer available.',
  })).toBeVisible()
  await expect(page.locator('.bitveins-mobile-sessions-drawer')).toHaveCount(0)
  await expect(page.locator('[data-bitveins-app]')).toBeVisible()
})
