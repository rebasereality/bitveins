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

interface WindowSessionResolver {
  findSessionNameByWindowId(windowId: string): Promise<string | null>
}

function createHermesAttentionEvent(
  event: HermesLifecycleEvent,
  sessionName: string,
): CreateHermesAttentionEvent {
  const context = {
    paneId: event.paneId,
    sessionName,
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
    reportResolutionError: (error: unknown) => void
    windowSessions: WindowSessionResolver
  }) {}

  async create(input: HermesLifecycleEvent): Promise<AttentionEvent | null> {
    const validated = hermesLifecycleEventSchema.parse(input)
    if (!isHermesLifecycleEnabled(this.dependencies.preferences.get(), validated.lifecycle)) {
      return null
    }
    if (!validated.windowId) return null

    let sessionName: string | null
    try {
      sessionName = await this.dependencies.windowSessions
        .findSessionNameByWindowId(validated.windowId)
    }
    catch (error) {
      this.dependencies.reportResolutionError(error)
      return null
    }
    if (!sessionName) return null

    return this.dependencies.attention.createHermes(
      createHermesAttentionEvent(validated, sessionName),
    )
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
