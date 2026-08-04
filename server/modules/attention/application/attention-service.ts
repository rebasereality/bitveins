import { randomUUID } from 'node:crypto'
import type {
  AttentionEvent,
  CreateAttentionEvent,
  CreateHermesAttentionEvent,
} from '#shared/contracts/attention'
import {
  createAttentionEventSchema,
  createHermesAttentionEventSchema,
} from '#shared/contracts/attention'
import type { AttentionRepository } from '../ports/attention-repository'
import type { AttentionEventPublisher, AttentionPushNotifier } from '../ports/attention-delivery'

interface AttentionServiceOptions {
  clock?: () => Date
  createId?: () => string
  publisher: AttentionEventPublisher
  push: AttentionPushNotifier
  repository: AttentionRepository
}

export class AttentionService {
  private readonly clock: () => Date
  private readonly createId: () => string
  private pendingPushNotifications = 0
  private pushQueue = Promise.resolve()

  constructor(private readonly options: AttentionServiceOptions) {
    this.clock = options.clock ?? (() => new Date())
    this.createId = options.createId ?? (() => `evt_${randomUUID().replaceAll('-', '')}`)
  }

  async create(input: CreateAttentionEvent): Promise<AttentionEvent> {
    return this.persist(createAttentionEventSchema.parse(input))
  }

  async createHermes(input: CreateHermesAttentionEvent): Promise<AttentionEvent> {
    return this.persist(createHermesAttentionEventSchema.parse(input))
  }

  private async persist(validated: CreateAttentionEvent | CreateHermesAttentionEvent): Promise<AttentionEvent> {
    const event = this.options.repository.create({
      ...validated,
      id: this.createId(),
      createdAt: this.clock().toISOString(),
    })

    this.options.publisher.publish(event)
    if (this.pendingPushNotifications < 100) {
      this.pendingPushNotifications += 1
      this.pushQueue = this.pushQueue
        .then(() => this.options.push.notify(event))
        .catch(() => {
          // Persistence and live delivery must not depend on external push providers.
        })
        .finally(() => {
          this.pendingPushNotifications -= 1
        })
    }
    return event
  }

  dismiss(id: string): AttentionEvent | null {
    return this.options.repository.dismiss(id, this.clock().toISOString())
  }

  list(): AttentionEvent[] {
    return this.options.repository.list()
  }

  markRead(id: string): AttentionEvent | null {
    return this.options.repository.markRead(id, this.clock().toISOString())
  }
}
