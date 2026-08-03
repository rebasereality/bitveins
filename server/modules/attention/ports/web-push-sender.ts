import type { PushNotificationPayload } from '../model/push-notification'
import type { PushSubscriptionInput } from '#shared/contracts/attention'

export interface WebPushSender {
  send(subscription: PushSubscriptionInput, payload: PushNotificationPayload): Promise<void>
}
