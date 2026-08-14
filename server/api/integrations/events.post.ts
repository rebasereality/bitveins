import {
  antigravityLifecycleEventSchema,
  codexLifecycleEventSchema,
  createAttentionEventSchema,
  hermesLifecycleEventSchema,
  integrationAttentionEventSchema,
} from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { assertEventIntegrationRequest } from '../../modules/attention/delivery/integration-auth'
import { FixedWindowRateLimiter } from '../../modules/attention/delivery/event-rate-limiter'
import { getValidatedEnv } from '../../utils/env'
import { readRequestBody } from '../../utils/request-validation'

const rateLimiter = new FixedWindowRateLimiter({ limit: 120, windowMs: 60_000 })

export default defineEventHandler(async (event) => {
  try {
    assertEventIntegrationRequest({
      authorization: getRequestHeader(event, 'authorization'),
      remoteAddress: event.node.req.socket.remoteAddress,
    }, getValidatedEnv().BITVEINS_EVENT_TOKEN)
  }
  catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized event integration request.' })
  }
  if (!rateLimiter.consume('loopback-integration')) {
    throw createError({ statusCode: 429, statusMessage: 'Event integration rate limit exceeded.' })
  }

  const body = await readRequestBody(event, integrationAttentionEventSchema, 16_384, true)
  const container = useBitveinsContainer()
  const antigravityEvent = antigravityLifecycleEventSchema.safeParse(body)
  if (antigravityEvent.success) {
    const created = await container.antigravityNotifications.create(antigravityEvent.data)
    return created
      ? { event: created }
      : { event: null, suppressed: true as const }
  }
  const codexEvent = codexLifecycleEventSchema.safeParse(body)
  if (codexEvent.success) {
    const created = await container.codexNotifications.create(codexEvent.data)
    return created
      ? { event: created }
      : { event: null, suppressed: true as const }
  }
  const hermesEvent = hermesLifecycleEventSchema.safeParse(body)
  if (hermesEvent.success) {
    const created = await container.hermesNotifications.create(hermesEvent.data)
    return created
      ? { event: created }
      : { event: null, suppressed: true as const }
  }
  return { event: await container.attention.create(createAttentionEventSchema.parse(body)) }
})
