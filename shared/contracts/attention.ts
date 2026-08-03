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

export const createAttentionEventSchema = z.object({
  type: attentionEventTypeSchema,
  source: safeText('Source', 80),
  title: safeText('Title', 160),
  summary: optionalSafeText('Summary', 2000),
  project: optionalSafeText('Project', 160),
  sessionName: sessionNameSchema.optional(),
  windowId: windowIdSchema.optional(),
  paneId: paneIdSchema.optional(),
}).strict()

export const attentionEventSchema = createAttentionEventSchema.extend({
  id: eventIdSchema,
  createdAt: isoTimestampSchema,
  readAt: isoTimestampSchema.optional(),
  dismissedAt: isoTimestampSchema.optional(),
}).strict()

export const attentionEventListSchema = z.object({
  events: z.array(attentionEventSchema),
}).strict()

const subscriptionKeySchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/u)
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(4096).refine(value => new URL(value).protocol === 'https:', 'Push endpoint must use HTTPS.'),
  expirationTime: z.number().finite().nonnegative().nullable().optional(),
  keys: z.object({
    auth: subscriptionKeySchema,
    p256dh: subscriptionKeySchema,
  }).strict(),
}).strict()

export const notificationPreferenceSchema = z.object({
  showDetails: z.boolean().default(false),
}).strict()

export const pushPublicConfigurationSchema = z.object({
  publicKey: z.string().min(1),
}).strict()

export const attentionWebSocketMessageSchema = z.object({
  type: z.literal('attentionEvent'),
  event: attentionEventSchema,
}).strict()

export type AttentionEventType = z.infer<typeof attentionEventTypeSchema>
export type CreateAttentionEvent = z.infer<typeof createAttentionEventSchema>
export type AttentionEvent = z.infer<typeof attentionEventSchema>
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>
export type AttentionWebSocketMessage = z.infer<typeof attentionWebSocketMessageSchema>

export function createAttentionDeepLink(event: Pick<AttentionEvent, 'id' | 'sessionName' | 'windowId'>): string {
  const query = new URLSearchParams()
  if (event.sessionName) query.set('session', event.sessionName)
  if (event.windowId) query.set('window', event.windowId)
  query.set('event', event.id)
  return `/?${query.toString()}`
}
