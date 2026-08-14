import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  path: text('path').notNull(),
  tmuxBound: integer('tmux_bound', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export const invalidatedSessionIds = sqliteTable('invalidated_session_ids', {
  id: text('id').primaryKey(),
  invalidatedAt: integer('invalidated_at').notNull(),
})

export const dropzones = sqliteTable('dropzones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  path: text('path').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const asyncMessages = sqliteTable('async_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionName: text('session_name').notNull(),
  windowId: text('window_id'),
  windowIndex: integer('window_index'),
  message: text('message').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [
  index('idx_async_messages_session_id').on(table.sessionName, table.id),
  index('idx_async_messages_window_id').on(table.sessionName, table.windowId, table.windowIndex, table.id),
])

export const attentionEvents = sqliteTable('attention_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  project: text('project'),
  sessionName: text('session_name'),
  sessionId: text('session_id'),
  windowId: text('window_id'),
  windowName: text('window_name'),
  paneId: text('pane_id'),
  createdAt: text('created_at').notNull(),
  readAt: text('read_at'),
  dismissedAt: text('dismissed_at'),
}, table => [
  index('idx_attention_events_created_at').on(table.createdAt),
])

export const webPushSubscriptions = sqliteTable('web_push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  expirationTime: integer('expiration_time'),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  showDetails: integer('show_details', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const webPushSessionMutes = sqliteTable('web_push_session_mutes', {
  endpoint: text('endpoint').notNull(),
  sessionId: text('session_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [
  primaryKey({ columns: [table.endpoint, table.sessionId] }),
  index('idx_web_push_session_mutes_session_id').on(table.sessionId),
])

export const hermesNotificationPreferences = sqliteTable('hermes_notification_preferences', {
  id: integer('id').primaryKey(),
  completedWithTools: integer('completed_with_tools', { mode: 'boolean' }).notNull().default(true),
  completedWithoutTools: integer('completed_without_tools', { mode: 'boolean' }).notNull().default(false),
  failed: integer('failed', { mode: 'boolean' }).notNull().default(true),
  inputRequired: integer('input_required', { mode: 'boolean' }).notNull().default(true),
  permissionRequired: integer('permission_required', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull(),
})

export const codexNotificationPreferences = sqliteTable('codex_notification_preferences', {
  id: integer('id').primaryKey(),
  completedWithTools: integer('completed_with_tools', { mode: 'boolean' }).notNull().default(true),
  completedWithoutTools: integer('completed_without_tools', { mode: 'boolean' }).notNull().default(false),
  permissionRequired: integer('permission_required', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull(),
})

export const antigravityNotificationPreferences = sqliteTable('antigravity_notification_preferences', {
  id: integer('id').primaryKey(),
  completedWithTools: integer('completed_with_tools', { mode: 'boolean' }).notNull().default(true),
  completedWithoutTools: integer('completed_without_tools', { mode: 'boolean' }).notNull().default(false),
  failed: integer('failed', { mode: 'boolean' }).notNull().default(true),
  inputRequired: integer('input_required', { mode: 'boolean' }).notNull().default(true),
  permissionRequired: integer('permission_required', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull(),
})

export const asyncPromptDrafts = sqliteTable('async_prompt_drafts', {
  sessionName: text('session_name').notNull(),
  windowId: text('window_id').notNull(),
  draft: text('draft').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  primaryKey({ columns: [table.sessionName, table.windowId] }),
  index('idx_async_prompt_drafts_updated_at').on(table.updatedAt),
])

export type Session = typeof sessions.$inferSelect
export type InvalidatedSessionId = typeof invalidatedSessionIds.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Dropzone = typeof dropzones.$inferSelect
export type NewDropzone = typeof dropzones.$inferInsert
export type AsyncMessage = typeof asyncMessages.$inferSelect
export type NewAsyncMessage = typeof asyncMessages.$inferInsert
export type AttentionEventRow = typeof attentionEvents.$inferSelect
export type WebPushSubscriptionRow = typeof webPushSubscriptions.$inferSelect
export type WebPushSessionMuteRow = typeof webPushSessionMutes.$inferSelect
export type HermesNotificationPreferenceRow = typeof hermesNotificationPreferences.$inferSelect
export type CodexNotificationPreferenceRow = typeof codexNotificationPreferences.$inferSelect
export type AntigravityNotificationPreferenceRow = typeof antigravityNotificationPreferences.$inferSelect
export type AsyncPromptDraftRow = typeof asyncPromptDrafts.$inferSelect
export type NewAsyncPromptDraftRow = typeof asyncPromptDrafts.$inferInsert
