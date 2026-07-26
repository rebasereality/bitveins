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

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Dropzone = typeof dropzones.$inferSelect
export type NewDropzone = typeof dropzones.$inferInsert
export type AsyncMessage = typeof asyncMessages.$inferSelect
export type NewAsyncMessage = typeof asyncMessages.$inferInsert
