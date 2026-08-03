import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  name: text('name').primaryKey(),
  path: text('path').notNull(),
  createdAt: integer('created_at').notNull(),
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
  windowId: text('window_id'),
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

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Dropzone = typeof dropzones.$inferSelect
export type NewDropzone = typeof dropzones.$inferInsert
export type AsyncMessage = typeof asyncMessages.$inferSelect
export type NewAsyncMessage = typeof asyncMessages.$inferInsert
export type AttentionEventRow = typeof attentionEvents.$inferSelect
export type WebPushSubscriptionRow = typeof webPushSubscriptions.$inferSelect
