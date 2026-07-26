import { z } from 'zod'

export const rasterMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
])

export type RasterMediaType = z.infer<typeof rasterMediaTypeSchema>

const textDocumentMetadataShape = {
  kind: z.literal('text'),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
}
const imageDocumentMetadataShape = {
  kind: z.literal('image'),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mediaType: rasterMediaTypeSchema,
}

export const explorerDocumentMetadataSchema = z.discriminatedUnion('kind', [
  z.object(textDocumentMetadataShape),
  z.object(imageDocumentMetadataShape),
])

export type ExplorerDocumentMetadata = z.infer<typeof explorerDocumentMetadataSchema>

export const explorerFileQuerySchema = z.object({
  path: z.string().trim().min(1).max(4096),
})

export const terminalFileReferenceSchema = z.object({
  path: z.string().trim().min(1).max(4096),
  line: z.number().int().min(1).max(10_000_000).optional(),
  column: z.number().int().min(1).max(10_000_000).optional(),
})

export const resolveTerminalFileReferencesBodySchema = z.object({
  windowId: z.string().min(1).max(128),
  rememberedRoot: z.string().trim().max(4096).optional(),
  references: z.array(terminalFileReferenceSchema).min(1).max(32),
})

export const resolvedExplorerDocumentSchema = z.discriminatedUnion('kind', [
  z.object({ ...textDocumentMetadataShape, absolutePath: z.string(), root: z.string() }),
  z.object({ ...imageDocumentMetadataShape, absolutePath: z.string(), root: z.string() }),
])

export const terminalFileResolutionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('missing'),
    reference: terminalFileReferenceSchema,
  }),
  z.object({
    status: z.literal('unique'),
    reference: terminalFileReferenceSchema,
    document: resolvedExplorerDocumentSchema,
  }),
  z.object({
    status: z.literal('ambiguous'),
    reference: terminalFileReferenceSchema,
    candidates: z.array(resolvedExplorerDocumentSchema).min(2),
  }),
])

export type TerminalFileReference = z.infer<typeof terminalFileReferenceSchema>
export type ResolvedExplorerDocument = z.infer<typeof resolvedExplorerDocumentSchema>
export type TerminalFileResolution = z.infer<typeof terminalFileResolutionSchema>
