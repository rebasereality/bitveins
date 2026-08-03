import { describe, expect, it } from 'vitest'
import { buildPushPayload, redactPushError } from '../../../../../server/modules/attention/model/push-notification'
import type { AttentionEvent } from '../../../../../shared/contracts/attention'

const event: AttentionEvent = {
  createdAt: '2026-08-03T12:00:00.000Z',
  id: 'evt_123456789012',
  project: 'Kouizine',
  sessionName: 'kouizine',
  source: 'Codex',
  summary: 'Run database migrations with sensitive production arguments?',
  title: 'Permission required',
  type: 'permission_required',
  windowId: '@4',
}

describe('push notification model', () => {
  it('hides the event summary by default', () => {
    expect(buildPushPayload(event, { showDetails: false })).toEqual({
      body: 'Project: Kouizine\nSource: Codex',
      data: { url: '/?session=kouizine&window=%404&event=evt_123456789012' },
      tag: 'attention:evt_123456789012',
      title: 'Permission required',
    })
  })

  it('includes bounded details only after explicit opt-in', () => {
    const payload = buildPushPayload({
      ...event,
      summary: 'x'.repeat(1000),
      title: 'y'.repeat(1000),
    }, { showDetails: true })

    expect(payload.title.length).toBeLessThanOrEqual(80)
    expect(payload.body.length).toBeLessThanOrEqual(240)
    expect(payload.body).toContain('x')
  })

  it('redacts endpoints, subscription keys and arbitrary provider messages', () => {
    const error = Object.assign(new Error('https://push.example.test/private subscription auth-secret'), {
      endpoint: 'https://push.example.test/private',
      statusCode: 503,
    })
    expect(redactPushError(error)).toEqual({
      code: 'web_push_failed',
      statusCode: 503,
    })
  })
})
