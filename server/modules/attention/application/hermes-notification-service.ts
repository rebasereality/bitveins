import type {
  AttentionEvent,
  CreateHermesAttentionEvent,
  HermesLifecycleEvent,
  HermesNotificationPreference,
  HermesNotificationPreferenceUpdate,
} from '#shared/contracts/attention'
import {
  hermesLifecycleEventSchema,
  isHermesLifecycleEnabled,
} from '#shared/contracts/attention'
import type { HermesNotificationPreferenceRepository } from '../ports/hermes-notification-preference-repository'

interface AttentionEventCreator {
  createHermes(input: CreateHermesAttentionEvent): Promise<AttentionEvent>
}

function createHermesAttentionEvent(event: HermesLifecycleEvent): CreateHermesAttentionEvent {
  const context = {
    paneId: event.paneId,
    source: event.source,
    windowId: event.windowId,
  }
  switch (event.lifecycle) {
    case 'input_required':
      return { ...context, title: 'Hermes is waiting for input', type: 'input_required' }
    case 'permission_required':
      return { ...context, title: 'Hermes needs permission', type: 'permission_required' }
    case 'completed_with_tools':
    case 'completed_without_tools':
      return { ...context, title: 'Hermes turn completed', type: 'completed' }
    case 'failed':
      return { ...context, title: 'Hermes turn failed', type: 'failed' }
  }
}

export class HermesNotificationService {
  constructor(private readonly dependencies: {
    attention: AttentionEventCreator
    preferences: HermesNotificationPreferenceRepository
  }) {}

  async create(input: HermesLifecycleEvent): Promise<AttentionEvent | null> {
    const validated = hermesLifecycleEventSchema.parse(input)
    if (!isHermesLifecycleEnabled(this.dependencies.preferences.get(), validated.lifecycle)) {
      return null
    }
    return this.dependencies.attention.createHermes(createHermesAttentionEvent(validated))
  }

  getPreference(): HermesNotificationPreference {
    return this.dependencies.preferences.get()
  }

  updatePreference(
    patch: HermesNotificationPreferenceUpdate,
    now: number,
  ): HermesNotificationPreference {
    return this.dependencies.preferences.update(patch, now)
  }
}
