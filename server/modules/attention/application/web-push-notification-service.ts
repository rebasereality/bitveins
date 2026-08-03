import type { AttentionEvent } from '#shared/contracts/attention'
import { buildPushPayload, redactPushError } from '../model/push-notification'
import type { AttentionPushNotifier } from '../ports/attention-delivery'
import type { PushSubscriptionRepository } from '../ports/push-subscription-repository'
import type { WebPushSender } from '../ports/web-push-sender'

interface WebPushNotificationServiceOptions {
  concurrency?: number
  logger?: { warn(message: string, details: unknown): void }
  repository: PushSubscriptionRepository
  sender: WebPushSender
}

export class WebPushNotificationService implements AttentionPushNotifier {
  private readonly concurrency: number

  constructor(private readonly options: WebPushNotificationServiceOptions) {
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4))
  }

  async notify(event: AttentionEvent): Promise<void> {
    const subscriptions = this.options.repository.list()
    const payload = buildPushPayload(event, this.options.repository.getPreference())
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < subscriptions.length) {
        const subscription = subscriptions[cursor++]
        if (!subscription) return
        try {
          await this.options.sender.send(subscription, payload)
        }
        catch (error) {
          const redacted = redactPushError(error)
          if (redacted.statusCode === 404 || redacted.statusCode === 410) {
            this.options.repository.remove(subscription.endpoint)
          }
          else {
            this.options.logger?.warn('Web Push delivery failed.', redacted)
          }
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, subscriptions.length) }, worker),
    )
  }
}
