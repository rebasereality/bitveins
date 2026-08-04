import type {
  AttentionEvent,
  CodexLifecycleEvent,
  CodexNotificationPreference,
  CodexNotificationPreferenceUpdate,
  CreateCodexAttentionEvent,
} from '#shared/contracts/attention'
import {
  codexLifecycleEventSchema,
  isCodexLifecycleEnabled,
} from '#shared/contracts/attention'
import type { CodexNotificationPreferenceRepository } from '../ports/codex-notification-preference-repository'

interface AttentionEventCreator {
  createCodex(input: CreateCodexAttentionEvent): Promise<AttentionEvent>
}

interface WindowSessionResolver {
  findSessionNameByWindowId(windowId: string): Promise<string | null>
}

function createCodexAttentionEvent(
  event: CodexLifecycleEvent,
  sessionName: string,
): CreateCodexAttentionEvent {
  const context = {
    paneId: event.paneId,
    sessionName,
    source: event.source,
    windowId: event.windowId,
  }
  switch (event.lifecycle) {
    case 'permission_required':
      return { ...context, title: 'Codex needs permission', type: 'permission_required' }
    case 'completed_with_tools':
    case 'completed_without_tools':
      return { ...context, title: 'Codex turn completed', type: 'completed' }
  }
}

export class CodexNotificationService {
  constructor(private readonly dependencies: {
    attention: AttentionEventCreator
    preferences: CodexNotificationPreferenceRepository
    reportResolutionError: (error: unknown) => void
    windowSessions: WindowSessionResolver
  }) {}

  async create(input: CodexLifecycleEvent): Promise<AttentionEvent | null> {
    const validated = codexLifecycleEventSchema.parse(input)
    if (!isCodexLifecycleEnabled(this.dependencies.preferences.get(), validated.lifecycle)) {
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

    return this.dependencies.attention.createCodex(
      createCodexAttentionEvent(validated, sessionName),
    )
  }

  getPreference(): CodexNotificationPreference {
    return this.dependencies.preferences.get()
  }

  updatePreference(
    patch: CodexNotificationPreferenceUpdate,
    now: number,
  ): CodexNotificationPreference {
    return this.dependencies.preferences.update(patch, now)
  }
}
