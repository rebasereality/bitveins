import { randomUUID } from 'node:crypto'
import type {
  AttentionEvent,
  CreateAntigravityAttentionEvent,
  CreateCodexAttentionEvent,
  CreateAttentionEvent,
  CreateHermesAttentionEvent,
} from '#shared/contracts/attention'
import {
  createAntigravityAttentionEventSchema,
  createAttentionEventSchema,
  createCodexAttentionEventSchema,
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
  resolveSessionId?: (sessionName: string) => Promise<string | null>
  resolveWindowName?: (sessionName: string, windowId: string) => Promise<string | null>
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

  async createCodex(input: CreateCodexAttentionEvent): Promise<AttentionEvent> {
    return this.persist(createCodexAttentionEventSchema.parse(input))
  }

  async createAntigravity(input: CreateAntigravityAttentionEvent): Promise<AttentionEvent> {
    return this.persist(createAntigravityAttentionEventSchema.parse(input))
  }

  private async persist(
    validated:
      | CreateAttentionEvent
      | CreateAntigravityAttentionEvent
      | CreateCodexAttentionEvent
      | CreateHermesAttentionEvent,
  ): Promise<AttentionEvent> {
    const sessionId = validated.sessionName
      ? await this.options.resolveSessionId?.(validated.sessionName).catch(() => null)
      : null
    const windowName = validated.sessionName && validated.windowId
      ? await this.options.resolveWindowName?.(validated.sessionName, validated.windowId).catch(() => null)
      : null
    const event = this.options.repository.create({
      ...validated,
      ...(sessionId ? { sessionId } : {}),
      ...(windowName ? { windowName } : {}),
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

  dismissAll(): { dismissedAt: string, ids: string[] } {
    const dismissedAt = this.clock().toISOString()
    return {
      dismissedAt,
      ids: this.options.repository.dismissAll(dismissedAt),
    }
  }

  list(): AttentionEvent[] {
    return this.options.repository.list()
  }

  markRead(id: string): AttentionEvent | null {
    return this.options.repository.markRead(id, this.clock().toISOString())
  }
}
