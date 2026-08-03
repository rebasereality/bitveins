import webPush from 'web-push'
import { isSupportedPushEndpoint, type PushSubscriptionInput } from '#shared/contracts/attention'
import type { PushNotificationPayload } from '../model/push-notification'
import type { WebPushSender } from '../ports/web-push-sender'

interface WebPushClient {
  sendNotification(
    subscription: PushSubscriptionInput,
    payload: string,
    options: webPush.RequestOptions,
  ): Promise<unknown>
}

export class NodeWebPushSender implements WebPushSender {
  constructor(private readonly options: {
    client?: WebPushClient
    privateKey: string
    publicKey: string
    subject?: string
    timeoutMs?: number
  }) {}

  async send(
    subscription: PushSubscriptionInput,
    payload: PushNotificationPayload,
  ): Promise<void> {
    if (!isSupportedPushEndpoint(subscription.endpoint)) {
      throw new Error('Unsupported Web Push endpoint.')
    }
    const client = this.options.client ?? webPush
    await client.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      timeout: this.options.timeoutMs ?? 10_000,
      urgency: 'high',
      vapidDetails: {
        privateKey: this.options.privateKey,
        publicKey: this.options.publicKey,
        subject: this.options.subject ?? 'mailto:bitveins@localhost',
      },
    })
  }
}
