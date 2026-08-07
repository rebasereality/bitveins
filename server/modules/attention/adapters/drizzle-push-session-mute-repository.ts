import { and, eq } from 'drizzle-orm'
import { webPushSessionMutes } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { PushSessionMuteRepository } from '../ports/push-session-mute-repository'

export class DrizzlePushSessionMuteRepository implements PushSessionMuteRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  isMuted(endpoint: string, sessionId: string): boolean {
    return Boolean(this.database.select({ sessionId: webPushSessionMutes.sessionId })
      .from(webPushSessionMutes)
      .where(and(
        eq(webPushSessionMutes.endpoint, endpoint),
        eq(webPushSessionMutes.sessionId, sessionId),
      ))
      .get())
  }

  list(endpoint: string): string[] {
    return this.database.select({ sessionId: webPushSessionMutes.sessionId })
      .from(webPushSessionMutes)
      .where(eq(webPushSessionMutes.endpoint, endpoint))
      .orderBy(webPushSessionMutes.sessionId)
      .all()
      .map(row => row.sessionId)
  }

  removeEndpoint(endpoint: string): void {
    this.database.delete(webPushSessionMutes)
      .where(eq(webPushSessionMutes.endpoint, endpoint))
      .run()
  }

  setMuted(endpoint: string, sessionId: string, muted: boolean, now: number): boolean {
    if (!muted) {
      this.database.delete(webPushSessionMutes)
        .where(and(
          eq(webPushSessionMutes.endpoint, endpoint),
          eq(webPushSessionMutes.sessionId, sessionId),
        ))
        .run()
      return false
    }

    this.database.insert(webPushSessionMutes)
      .values({ createdAt: now, endpoint, sessionId })
      .onConflictDoNothing()
      .run()
    return true
  }
}
