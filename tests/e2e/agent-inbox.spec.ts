import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE
if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}
const sessionName = `inbox_${runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)}`

test('opens the linked tmux window from Agent Inbox', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const sessionResponse = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)

    const windowResponse = await page.request.post(`/api/sessions/${sessionName}/windows`)
    expect(windowResponse.ok(), await windowResponse.text()).toBe(true)
    const { window: tmuxWindow } = await windowResponse.json() as {
      window: { id: string, index: number, name: string }
    }

    const subscriptionResponse = await page.request.post('/api/attention/push/subscriptions', {
      data: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device',
        keys: { auth: 'e2e-auth', p256dh: 'e2e-public-key' },
      },
    })
    expect(subscriptionResponse.ok(), await subscriptionResponse.text()).toBe(true)
    const unsubscribeResponse = await page.request.delete('/api/attention/push/subscriptions', {
      data: { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device' },
    })
    expect(unsubscribeResponse.ok(), await unsubscribeResponse.text()).toBe(true)

    const attentionSocket = page.waitForEvent('websocket', socket => socket.url().endsWith('/api/ws'))
    await page.reload()
    await attentionSocket

    const eventResponse = await page.request.post('/api/attention', {
      data: {
        project: 'E2E project',
        sessionName,
        source: 'test-agent',
        summary: 'Open the linked window',
        title: 'Attention required',
        type: 'input_required',
        windowId: tmuxWindow.id,
      },
    })
    expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
    const { event } = await eventResponse.json() as { event: { id: string } }

    await page.getByLabel('Open Agent Inbox').click()
    const inboxEvent = page.locator(`[data-event-id="${event.id}"]`)
    await expect(inboxEvent).toContainText('Attention required')
    await expect(inboxEvent).toContainText('E2E project / test-agent')
    await inboxEvent.click()

    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect(page.getByRole('tab', { name: new RegExp(`Tmux window ${tmuxWindow.index}:`) }))
      .toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => new URL(page.url()).searchParams.get('event')).toBe(event.id)

    const inboxResponse = await page.request.get('/api/attention')
    const body = await inboxResponse.json() as { events: Array<{ id: string, readAt?: string }> }
    expect(body.events.find(candidate => candidate.id === event.id)?.readAt).toBeTruthy()
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})

test('does not attach a reserved helper session from a legacy event', async ({ page }) => {
  await authenticate(page)

  const eventResponse = await page.request.post('/api/attention', {
    data: {
      sessionName: '_bitveins_legacy_helper',
      source: 'test-agent',
      title: 'Legacy helper target',
      type: 'information',
      windowId: '@1',
    },
  })
  expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
  const { event } = await eventResponse.json() as { event: { id: string } }

  await page.getByLabel('Open Agent Inbox').click()
  await page.locator(`[data-event-id="${event.id}"]`).click()

  await expect(page.getByText('The linked tmux session is no longer available.').first()).toBeVisible()
  await expect(page.locator('[data-bitveins-app]')).toBeVisible()
})
