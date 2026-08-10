import { z } from 'zod'
import type { TmuxSession } from './terminal'

const sessionNameSchema = z.string().min(1, 'Session name is required.').max(80)
const workspacePathSchema = z.string().min(1, 'Path is required.').max(4096)
const windowIndexSchema = z.coerce.number().int().min(0).max(999)
const windowIdSchema = z.string().regex(/^@\d+$/, 'A valid tmux window id is required.')
export const paneIdSchema = z.string().regex(/^%\d+$/, 'A valid tmux pane id is required.')
export const MAX_HISTORY_MESSAGE_CHARS = 1024 * 1024
const windowNameSchema = z
  .string({ error: 'A window name is required.' })
  .min(1, 'A window name is required.')
  .max(80, 'Window names must be 1-80 characters and cannot contain control characters.')
  .regex(
    /^[^\u0000-\u001F\u007F]+$/,
    'Window names must be 1-80 characters and cannot contain control characters.',
  )

export const createSessionBodySchema = z.object({
  name: sessionNameSchema,
  path: workspacePathSchema,
})

export const openTransferBodySchema = z.object({
  name: z.string().min(1, 'Transfer name is required.').max(80),
  path: workspacePathSchema,
})

export const renameSessionBodySchema = z.object({
  name: sessionNameSchema,
})

export const renameWindowBodySchema = z.object({
  name: windowNameSchema,
})

export const splitPaneBodySchema = z.object({
  direction: z.enum(['horizontal', 'vertical']),
  paneId: paneIdSchema,
})

export const selectPaneBodySchema = z.object({
  paneId: paneIdSchema,
})

export const resizePaneBodySchema = z.object({
  dimension: z.enum(['height', 'width']),
  paneId: paneIdSchema,
  size: z.coerce.number().int().min(2).max(1_000),
})

export const killPaneQuerySchema = z.object({
  paneId: paneIdSchema,
})

export const paneSnapshotQuerySchema = z.object({
  lines: z.coerce.number().int().positive().max(20_000).optional(),
  paneId: paneIdSchema.optional(),
})

export const historyScopeSchema = z.object({
  windowId: windowIdSchema,
  windowIndex: windowIndexSchema,
})

export const saveHistoryBodySchema = historyScopeSchema.extend({
  message: z.string()
    .min(1, 'History message is required.')
    .max(MAX_HISTORY_MESSAGE_CHARS, 'History message exceeds the 1-million-character recovery limit.'),
})

export const saveFileBodySchema = z.object({
  path: workspacePathSchema,
  content: z.string().max(5 * 1024 * 1024, 'File content exceeds the 5 MiB editor limit.'),
})

export const createFileBodySchema = z.object({
  path: workspacePathSchema,
  isDir: z.boolean().default(false),
})

export const deleteFileBodySchema = z.object({
  path: workspacePathSchema,
})

export const dropzoneSchema = z.object({
  name: z.string().min(1).max(80),
  path: workspacePathSchema,
})

export const saveDropzonesBodySchema = z.object({
  dropzones: z.array(dropzoneSchema).max(100).default([]),
})

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>
export type OpenTransferBody = z.infer<typeof openTransferBodySchema>
export interface OpenTransferResponse {
  created: boolean
  session: TmuxSession
}
export type RenameSessionBody = z.infer<typeof renameSessionBodySchema>
export type RenameWindowBody = z.infer<typeof renameWindowBodySchema>
export type SaveHistoryBody = z.infer<typeof saveHistoryBodySchema>
export type SaveFileBody = z.infer<typeof saveFileBodySchema>
export type CreateFileBody = z.infer<typeof createFileBodySchema>
export type DeleteFileBody = z.infer<typeof deleteFileBodySchema>
export type SaveDropzonesBody = z.infer<typeof saveDropzonesBodySchema>
