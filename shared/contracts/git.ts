import { z } from 'zod'

export const gitCommitHashSchema = z.string().regex(/^[0-9a-f]{40,64}$/i)

export const gitGraphQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(80),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

export const gitReferenceSchema = z.object({
  kind: z.enum(['head', 'branch', 'remote', 'tag', 'other']),
  name: z.string().min(1),
})

export const gitCommitSchema = z.object({
  hash: gitCommitHashSchema,
  shortHash: z.string().min(7).max(16),
  parents: z.array(gitCommitHashSchema),
  subject: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  authoredAt: z.string(),
  references: z.array(gitReferenceSchema),
})

export const gitGraphResponseSchema = z.object({
  repository: z.string().min(1),
  branch: z.string().min(1),
  detached: z.boolean(),
  commits: z.array(gitCommitSchema),
  hasMore: z.boolean(),
})

export const gitFileChangeSchema = z.object({
  path: z.string().min(1),
  previousPath: z.string().min(1).optional(),
  status: z.enum(['added', 'copied', 'deleted', 'modified', 'renamed', 'type-changed', 'unknown']),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
})

export const gitCommitDetailsSchema = z.object({
  commit: gitCommitSchema.extend({
    body: z.string(),
    committerName: z.string(),
    committerEmail: z.string(),
    committedAt: z.string(),
  }),
  files: z.array(gitFileChangeSchema),
})

export const gitDiffQuerySchema = z.object({
  commit: gitCommitHashSchema,
  path: z.string().min(1).max(4096),
})

export const gitFileDiffSchema = z.object({
  commit: gitCommitHashSchema,
  path: z.string().min(1),
  previousPath: z.string().min(1).optional(),
  status: gitFileChangeSchema.shape.status,
  binary: z.boolean(),
  before: z.string().nullable(),
  after: z.string().nullable(),
})

export type GitCommit = z.infer<typeof gitCommitSchema>
export type GitGraphResponse = z.infer<typeof gitGraphResponseSchema>
export type GitFileChange = z.infer<typeof gitFileChangeSchema>
export type GitCommitDetails = z.infer<typeof gitCommitDetailsSchema>
export type GitFileDiff = z.infer<typeof gitFileDiffSchema>
