import type { AttentionEvent } from '#shared/contracts/attention'

export interface AttentionEventPublisher {
  publish(event: AttentionEvent): void
}

export interface AttentionPushNotifier {
  notify(event: AttentionEvent): Promise<void>
}
