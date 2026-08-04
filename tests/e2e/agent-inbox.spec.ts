import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const eventToken = process.env.BITVEINS_E2E_EVENT_TOKEN
const workspace = process.env.BITVEINS_E2E_WORKSPACE
if (!eventToken || !runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}
const sessionName = `inbox_${runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)}`
const staleWindowSessionName = `stale_${runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)}`
const codexSessionName = `codex_${runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)}`
const hermesSessionName = `hermes_${runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)}`

test('persists a Codex permission event with a server-owned title and linked session', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const sessionResponse = await page.request.post('/api/sessions', {
      data: { name: codexSessionName, path: workspace },
    })
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)

    const windowResponse = await page.request.post(`/api/sessions/${codexSessionName}/windows`)
    expect(windowResponse.ok(), await windowResponse.text()).toBe(true)
    const { window: tmuxWindow } = await windowResponse.json() as {
      window: { id: string }
    }

    const eventResponse = await page.request.post('/api/integrations/events', {
      data: {
        lifecycle: 'permission_required',
        source: 'codex',
        type: 'permission_required',
        windowId: tmuxWindow.id,
      },
      headers: { authorization: `Bearer ${eventToken}` },
    })
    expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
    const response = await eventResponse.json() as {
      event: { id: string, sessionName?: string, title: string } | null
      suppressed?: boolean
    }
    expect(response.event).toMatchObject({
      sessionName: codexSessionName,
      title: 'Codex needs permission',
    })
    expect(response.suppressed).toBeUndefined()

    const inboxResponse = await page.request.get('/api/attention')
    expect(inboxResponse.ok(), await inboxResponse.text()).toBe(true)
    const inbox = await inboxResponse.json() as {
      events: Array<{ id: string, sessionName?: string, source: string }>
    }
    expect(inbox.events.find(event => event.id === response.event?.id)).toMatchObject({
      sessionName: codexSessionName,
      source: 'codex',
    })
  }
  finally {
    await page.request.delete(`/api/sessions/${codexSessionName}`).catch(() => undefined)
  }
})

test('persists a Hermes integration event with its resolved tmux session', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const sessionResponse = await page.request.post('/api/sessions', {
      data: { name: hermesSessionName, path: workspace },
    })
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)

    const windowResponse = await page.request.post(`/api/sessions/${hermesSessionName}/windows`)
    expect(windowResponse.ok(), await windowResponse.text()).toBe(true)
    const { window: tmuxWindow } = await windowResponse.json() as {
      window: { id: string }
    }

    const eventResponse = await page.request.post('/api/integrations/events', {
      data: {
        lifecycle: 'completed_with_tools',
        source: 'hermes',
        type: 'completed',
        windowId: tmuxWindow.id,
      },
      headers: { authorization: `Bearer ${eventToken}` },
    })
    expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
    const response = await eventResponse.json() as {
      event: { id: string, sessionName?: string } | null
      suppressed?: boolean
    }
    expect(response.event).toMatchObject({
      sessionName: hermesSessionName,
    })
    expect(response.suppressed).toBeUndefined()

    const inboxResponse = await page.request.get('/api/attention')
    expect(inboxResponse.ok(), await inboxResponse.text()).toBe(true)
    const inbox = await inboxResponse.json() as {
      events: Array<{ id: string, sessionName?: string }>
    }
    expect(inbox.events.find(event => event.id === response.event?.id)).toMatchObject({
      sessionName: hermesSessionName,
    })
  }
  finally {
    await page.request.delete(`/api/sessions/${hermesSessionName}`).catch(() => undefined)
  }
})

test('dismisses every Agent Inbox event with one action', async ({ page }) => {
  await authenticate(page)
  const eventIds: string[] = []

  for (const index of [1, 2, 3]) {
    const eventResponse = await page.request.post('/api/attention', {
      data: {
        source: 'test-agent',
        title: `Bulk dismissal event ${index}`,
        type: 'information',
      },
    })
    expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
    const { event } = await eventResponse.json() as { event: { id: string } }
    eventIds.push(event.id)
  }

  await page.getByLabel('Open Agent Inbox').click()
  for (const id of eventIds) {
    await expect(page.locator(`[data-event-id="${id}"]`)).toBeVisible()
  }

  await page.getByRole('button', { exact: true, name: 'Dismiss all' }).click()
  await expect(page.getByText('No events yet.')).toBeVisible()

  const inboxResponse = await page.request.get('/api/attention')
  expect(inboxResponse.ok(), await inboxResponse.text()).toBe(true)
  const body = await inboxResponse.json() as {
    events: Array<{ dismissedAt?: string, id: string }>
  }
  for (const id of eventIds) {
    expect(body.events.find(event => event.id === id)?.dismissedAt).toBeTruthy()
  }
})

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
    await expect.poll(() => new URL(page.url()).pathname)
      .toMatch(new RegExp(`^/s/${sessionName}~[A-Za-z0-9_-]{16}/t/${tmuxWindow.id.slice(1)}$`, 'u'))

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

test('does not attach a session when its linked tmux window no longer exists', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const createResponse = await page.request.post('/api/sessions', {
      data: { name: staleWindowSessionName, path: workspace },
    })
    expect(createResponse.ok(), await createResponse.text()).toBe(true)

    const eventResponse = await page.request.post('/api/attention', {
      data: {
        sessionName: staleWindowSessionName,
        source: 'test-agent',
        title: 'Stale window target',
        type: 'information',
        windowId: '@999999',
      },
    })
    expect(eventResponse.ok(), await eventResponse.text()).toBe(true)
    const { event } = await eventResponse.json() as { event: { id: string } }

    await page.getByLabel('Open Agent Inbox').click()
    await page.locator(`[data-event-id="${event.id}"]`).click()

    await expect(page.getByText('The linked tmux window is no longer available.').first()).toBeVisible()
    await expect(page.locator('[data-session-active="true"]', { hasText: staleWindowSessionName })).toHaveCount(0)
  }
  finally {
    await page.request.delete(`/api/sessions/${staleWindowSessionName}`).catch(() => undefined)
  }
})
