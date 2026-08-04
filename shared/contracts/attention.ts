import { z } from 'zod'

const safeText = (label: string, max: number) => z.string()
  .trim()
  .min(1, `${label} is required.`)
  .max(max, `${label} is too long.`)
  .refine(value => !/[\u0000-\u001F\u007F]/u.test(value), `${label} contains unsupported control characters.`)

const optionalSafeText = (label: string, max: number) => safeText(label, max).optional()
const isoTimestampSchema = z.iso.datetime({ offset: true })
const eventIdSchema = z.string().regex(/^evt_[A-Za-z0-9_-]{12,80}$/u, 'A valid attention event id is required.')
const sessionNameSchema = safeText('Session name', 80)
const windowIdSchema = z.string().regex(/^@\d+$/u, 'A valid tmux window id is required.')
const paneIdSchema = z.string().regex(/^%\d+$/u, 'A valid tmux pane id is required.')

export const attentionEventTypeSchema = z.enum([
  'input_required',
  'permission_required',
  'completed',
  'failed',
  'information',
])

export const hermesLifecycleSchema = z.enum([
  'input_required',
  'permission_required',
  'completed_with_tools',
  'completed_without_tools',
  'failed',
])

export const codexLifecycleSchema = z.enum([
  'permission_required',
  'completed_with_tools',
  'completed_without_tools',
])

const hermesNotificationPreferenceShape = {
  completedWithTools: z.boolean(),
  completedWithoutTools: z.boolean(),
  failed: z.boolean(),
  inputRequired: z.boolean(),
  permissionRequired: z.boolean(),
}

export const hermesNotificationPreferenceSchema = z.object({
  completedWithTools: hermesNotificationPreferenceShape.completedWithTools.default(true),
  completedWithoutTools: hermesNotificationPreferenceShape.completedWithoutTools.default(false),
  failed: hermesNotificationPreferenceShape.failed.default(true),
  inputRequired: hermesNotificationPreferenceShape.inputRequired.default(true),
  permissionRequired: hermesNotificationPreferenceShape.permissionRequired.default(true),
}).strict()

export const hermesNotificationPreferenceUpdateSchema = z.object({
  completedWithTools: hermesNotificationPreferenceShape.completedWithTools.optional(),
  completedWithoutTools: hermesNotificationPreferenceShape.completedWithoutTools.optional(),
  failed: hermesNotificationPreferenceShape.failed.optional(),
  inputRequired: hermesNotificationPreferenceShape.inputRequired.optional(),
  permissionRequired: hermesNotificationPreferenceShape.permissionRequired.optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), {
  message: 'At least one Hermes notification preference is required.',
})

export const hermesNotificationPreferenceResponseSchema = z.object({
  preference: hermesNotificationPreferenceSchema,
}).strict()

const codexNotificationPreferenceShape = {
  completedWithTools: z.boolean(),
  completedWithoutTools: z.boolean(),
  permissionRequired: z.boolean(),
}

export const codexNotificationPreferenceSchema = z.object({
  completedWithTools: codexNotificationPreferenceShape.completedWithTools.default(true),
  completedWithoutTools: codexNotificationPreferenceShape.completedWithoutTools.default(false),
  permissionRequired: codexNotificationPreferenceShape.permissionRequired.default(true),
}).strict()

export const codexNotificationPreferenceUpdateSchema = z.object({
  completedWithTools: codexNotificationPreferenceShape.completedWithTools.optional(),
  completedWithoutTools: codexNotificationPreferenceShape.completedWithoutTools.optional(),
  permissionRequired: codexNotificationPreferenceShape.permissionRequired.optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), {
  message: 'At least one Codex notification preference is required.',
})

export const codexNotificationPreferenceResponseSchema = z.object({
  preference: codexNotificationPreferenceSchema,
}).strict()

const attentionEventInputSchema = z.object({
  type: attentionEventTypeSchema,
  source: safeText('Source', 80),
  title: safeText('Title', 160),
  summary: optionalSafeText('Summary', 2000),
  project: optionalSafeText('Project', 160),
  sessionName: sessionNameSchema.optional(),
  windowId: windowIdSchema.optional(),
  paneId: paneIdSchema.optional(),
}).strict()

export const createAttentionEventSchema = attentionEventInputSchema.refine(
  event => !['codex', 'hermes'].includes(event.source.toLowerCase()),
  'Agent lifecycle events require their dedicated integration.',
)

const hermesAttentionContextShape = {
  paneId: paneIdSchema.optional(),
  sessionName: sessionNameSchema,
  source: z.literal('hermes'),
  windowId: windowIdSchema.optional(),
}

export const createHermesAttentionEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...hermesAttentionContextShape,
    title: z.literal('Hermes is waiting for input'),
    type: z.literal('input_required'),
  }).strict(),
  z.object({
    ...hermesAttentionContextShape,
    title: z.literal('Hermes needs permission'),
    type: z.literal('permission_required'),
  }).strict(),
  z.object({
    ...hermesAttentionContextShape,
    title: z.literal('Hermes turn completed'),
    type: z.literal('completed'),
  }).strict(),
  z.object({
    ...hermesAttentionContextShape,
    title: z.literal('Hermes turn failed'),
    type: z.literal('failed'),
  }).strict(),
])

const codexAttentionContextShape = {
  paneId: paneIdSchema.optional(),
  sessionName: sessionNameSchema,
  source: z.literal('codex'),
  windowId: windowIdSchema.optional(),
}

export const createCodexAttentionEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...codexAttentionContextShape,
    title: z.literal('Codex needs permission'),
    type: z.literal('permission_required'),
  }).strict(),
  z.object({
    ...codexAttentionContextShape,
    title: z.literal('Codex turn completed'),
    type: z.literal('completed'),
  }).strict(),
])

const hermesLifecycleVariant = <
  const Lifecycle extends z.infer<typeof hermesLifecycleSchema>,
  const Type extends z.infer<typeof attentionEventTypeSchema>,
>(lifecycle: Lifecycle, type: Type) => z.object({
  lifecycle: z.literal(lifecycle),
  source: z.literal('hermes'),
  type: z.literal(type),
  windowId: windowIdSchema.optional(),
  paneId: paneIdSchema.optional(),
}).strict()

export const hermesLifecycleEventSchema = z.discriminatedUnion('lifecycle', [
  hermesLifecycleVariant('input_required', 'input_required'),
  hermesLifecycleVariant('permission_required', 'permission_required'),
  hermesLifecycleVariant('completed_with_tools', 'completed'),
  hermesLifecycleVariant('completed_without_tools', 'completed'),
  hermesLifecycleVariant('failed', 'failed'),
])

const codexLifecycleVariant = <
  const Lifecycle extends z.infer<typeof codexLifecycleSchema>,
  const Type extends z.infer<typeof attentionEventTypeSchema>,
>(lifecycle: Lifecycle, type: Type) => z.object({
  lifecycle: z.literal(lifecycle),
  source: z.literal('codex'),
  type: z.literal(type),
  windowId: windowIdSchema.optional(),
  paneId: paneIdSchema.optional(),
}).strict()

export const codexLifecycleEventSchema = z.discriminatedUnion('lifecycle', [
  codexLifecycleVariant('permission_required', 'permission_required'),
  codexLifecycleVariant('completed_with_tools', 'completed'),
  codexLifecycleVariant('completed_without_tools', 'completed'),
])

const legacyHermesLifecycleByType = {
  completed: 'completed_with_tools',
  failed: 'failed',
  input_required: 'input_required',
  permission_required: 'permission_required',
} as const

const legacyHermesContextShape = {
  source: z.literal('hermes'),
  windowId: windowIdSchema.optional(),
  paneId: paneIdSchema.optional(),
}

const legacyHermesLifecycleEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...legacyHermesContextShape,
    type: z.literal('input_required'),
    title: z.literal('Hermes is waiting for input'),
  }).strict(),
  z.object({
    ...legacyHermesContextShape,
    type: z.literal('permission_required'),
    title: z.literal('Hermes needs permission'),
  }).strict(),
  z.object({
    ...legacyHermesContextShape,
    type: z.literal('completed'),
    title: z.enum(['Hermes task completed', 'Hermes turn completed']),
  }).strict(),
  z.object({
    ...legacyHermesContextShape,
    type: z.literal('failed'),
    title: z.literal('Hermes turn failed'),
  }).strict(),
]).transform(({ title: _title, ...event }) => ({
  ...event,
  lifecycle: legacyHermesLifecycleByType[event.type],
}))

export const integrationAttentionEventSchema = z.union([
  codexLifecycleEventSchema,
  hermesLifecycleEventSchema,
  legacyHermesLifecycleEventSchema,
  createAttentionEventSchema,
])

export const attentionEventSchema = attentionEventInputSchema.extend({
  id: eventIdSchema,
  createdAt: isoTimestampSchema,
  readAt: isoTimestampSchema.optional(),
  dismissedAt: isoTimestampSchema.optional(),
}).strict()

export const attentionEventListSchema = z.object({
  events: z.array(attentionEventSchema),
}).strict()

export const attentionEventResponseSchema = z.object({
  event: attentionEventSchema,
}).strict()

export const integrationAttentionEventResponseSchema = z.union([
  attentionEventResponseSchema,
  z.object({
    event: z.null(),
    suppressed: z.literal(true),
  }).strict(),
])

const subscriptionKeySchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/u)
const pushServiceHosts = new Set([
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])
const pushServiceSuffixes = [
  '.notify.live.net',
  '.notify.windows.com',
  '.push.apple.com',
]

export function isSupportedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && (pushServiceHosts.has(hostname) || pushServiceSuffixes.some(suffix => hostname.endsWith(suffix)))
  }
  catch {
    return false
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(4096).refine(
    isSupportedPushEndpoint,
    'Push endpoint is not a supported browser push service.',
  ),
  expirationTime: z.number().finite().nonnegative().nullable().optional(),
  keys: z.object({
    auth: subscriptionKeySchema,
    p256dh: subscriptionKeySchema,
  }).strict(),
}).strict()

export const notificationPreferenceSchema = z.object({
  showDetails: z.boolean().default(false),
}).strict()

export const notificationPreferenceUpdateSchema = notificationPreferenceSchema.extend({
  endpoint: pushSubscriptionSchema.shape.endpoint,
}).strict()

export const pushConfigurationQuerySchema = z.object({
  endpoint: pushSubscriptionSchema.shape.endpoint.optional(),
}).strict()

export const unsubscribePushSchema = z.object({
  endpoint: pushSubscriptionSchema.shape.endpoint,
}).strict()

export const attentionStateUpdateSchema = z.object({
  action: z.enum(['read', 'dismiss']),
}).strict()

export const dismissAllAttentionEventsSchema = z.object({
  action: z.literal('dismiss'),
}).strict()

export const dismissAllAttentionEventsResponseSchema = z.object({
  dismissedAt: isoTimestampSchema,
  ids: z.array(eventIdSchema),
}).strict()

export const pushPublicConfigurationSchema = z.object({
  preference: notificationPreferenceSchema,
  publicKey: z.string().min(80).max(200),
}).strict()

export const attentionWebSocketMessageSchema = z.object({
  type: z.literal('attentionEvent'),
  event: attentionEventSchema,
}).strict()

export const pushNotificationPayloadSchema = z.object({
  body: z.string().min(1).max(240).refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)),
  data: z.object({
    url: z.string().max(512).regex(/^\/\?(?:[A-Za-z]+=[^&]*&?)+$/u),
  }).strict(),
  tag: z.string().regex(/^attention:evt_[A-Za-z0-9_-]{12,80}$/u),
  title: safeText('Notification title', 80),
}).strict()

export type AttentionEventType = z.infer<typeof attentionEventTypeSchema>
export type CodexLifecycle = z.infer<typeof codexLifecycleSchema>
export type CodexLifecycleEvent = z.infer<typeof codexLifecycleEventSchema>
export type CodexNotificationPreference = z.infer<typeof codexNotificationPreferenceSchema>
export type CodexNotificationPreferenceUpdate = z.infer<typeof codexNotificationPreferenceUpdateSchema>
export type HermesLifecycle = z.infer<typeof hermesLifecycleSchema>
export type HermesLifecycleEvent = z.infer<typeof hermesLifecycleEventSchema>
export type HermesNotificationPreference = z.infer<typeof hermesNotificationPreferenceSchema>
export type HermesNotificationPreferenceUpdate = z.infer<typeof hermesNotificationPreferenceUpdateSchema>
export type CreateAttentionEvent = z.infer<typeof createAttentionEventSchema>
export type CreateCodexAttentionEvent = z.infer<typeof createCodexAttentionEventSchema>
export type CreateHermesAttentionEvent = z.infer<typeof createHermesAttentionEventSchema>
export type AttentionEvent = z.infer<typeof attentionEventSchema>
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>
export type AttentionWebSocketMessage = z.infer<typeof attentionWebSocketMessageSchema>
export type PushNotificationPayload = z.infer<typeof pushNotificationPayloadSchema>

export function isHermesLifecycleEnabled(
  preference: HermesNotificationPreference,
  lifecycle: HermesLifecycle,
): boolean {
  return {
    completed_with_tools: preference.completedWithTools,
    completed_without_tools: preference.completedWithoutTools,
    failed: preference.failed,
    input_required: preference.inputRequired,
    permission_required: preference.permissionRequired,
  }[lifecycle]
}

export function isCodexLifecycleEnabled(
  preference: CodexNotificationPreference,
  lifecycle: CodexLifecycle,
): boolean {
  return {
    completed_with_tools: preference.completedWithTools,
    completed_without_tools: preference.completedWithoutTools,
    permission_required: preference.permissionRequired,
  }[lifecycle]
}

export function createAttentionDeepLink(event: Pick<AttentionEvent, 'id' | 'sessionName' | 'windowId'>): string {
  const query = new URLSearchParams()
  if (event.sessionName) query.set('session', event.sessionName)
  if (event.windowId) query.set('window', event.windowId)
  query.set('event', event.id)
  return `/?${query.toString()}`
}
