import { z } from 'zod'

export const tmuxAgentKindSchema = z.enum([
  'aider',
  'claude',
  'codex',
  'copilot',
  'cursor',
  'gemini',
  'hermes',
  'opencode',
  'pi',
])

export const tmuxAgentStatusSchema = z.enum([
  'blocked',
  'failed',
  'idle',
  'unknown',
  'working',
])

export const tmuxAgentLabelSchema = z.string()
  .trim()
  .min(1, 'Agent name is required.')
  .max(80, 'Agent names must be 1-80 characters.')
  .refine(value => !/[\u0000-\u001F\u007F]/u.test(value), 'Agent names cannot contain control characters.')

const tmuxAgentGitTextSchema = z.string()
  .trim()
  .min(1)
  .max(255)
  .refine(value => !/[\u0000-\u001F\u007F]/u.test(value))

export const tmuxAgentGitMetadataSchema = z.object({
  detached: z.boolean(),
  linkedWorktree: z.boolean(),
  reference: tmuxAgentGitTextSchema,
  repository: tmuxAgentGitTextSchema,
}).strict()

export const tmuxAgentSchema = z.object({
  customLabel: tmuxAgentLabelSchema.optional(),
  defaultLabel: tmuxAgentLabelSchema,
  git: tmuxAgentGitMetadataSchema.optional(),
  id: z.string().regex(/^%\d+$/u),
  kind: tmuxAgentKindSchema,
  label: tmuxAgentLabelSchema,
  paneId: z.string().regex(/^%\d+$/u),
  paneIndex: z.number().int().nonnegative(),
  path: z.string(),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{16}$/u).optional(),
  sessionName: z.string(),
  status: tmuxAgentStatusSchema,
  windowId: z.string().regex(/^@\d+$/u),
  windowIndex: z.number().int().nonnegative(),
  windowName: z.string(),
}).strict()

export const tmuxAgentListSchema = z.object({
  agents: z.array(tmuxAgentSchema),
}).strict()

export const renameTmuxAgentBodySchema = z.object({
  label: tmuxAgentLabelSchema.nullable(),
}).strict()

export type TmuxAgent = z.infer<typeof tmuxAgentSchema>
export type TmuxAgentGitMetadata = z.infer<typeof tmuxAgentGitMetadataSchema>
export type TmuxAgentKind = z.infer<typeof tmuxAgentKindSchema>
export type TmuxAgentStatus = z.infer<typeof tmuxAgentStatusSchema>
export type RenameTmuxAgentBody = z.infer<typeof renameTmuxAgentBodySchema>
