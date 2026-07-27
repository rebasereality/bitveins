import { z } from 'zod'

export const browserImageMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
])

export const imageMediaTypeSchema = z.enum([
  ...browserImageMediaTypeSchema.options,
  'image/tiff',
])

export const videoMediaTypeSchema = z.enum([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/mpeg',
  'video/3gpp',
])

export const sourcePreviewKindSchema = z.enum(['markdown', 'svg'])

export type BrowserImageMediaType = z.infer<typeof browserImageMediaTypeSchema>
export type ImageMediaType = z.infer<typeof imageMediaTypeSchema>
export type VideoMediaType = z.infer<typeof videoMediaTypeSchema>
export type SourcePreviewKind = z.infer<typeof sourcePreviewKindSchema>

const textDocumentMetadataShape = {
  kind: z.literal('text'),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  previewKind: sourcePreviewKindSchema.optional(),
}
const imageDocumentMetadataShape = {
  kind: z.literal('image'),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mediaType: imageMediaTypeSchema,
  previewMediaType: browserImageMediaTypeSchema,
}
const videoDocumentMetadataShape = {
  kind: z.literal('video'),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mediaType: videoMediaTypeSchema,
}
const binaryDocumentMetadataShape = {
  kind: z.literal('binary'),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
}

export const explorerDocumentMetadataSchema = z.discriminatedUnion('kind', [
  z.object(textDocumentMetadataShape),
  z.object(imageDocumentMetadataShape),
  z.object(videoDocumentMetadataShape),
  z.object(binaryDocumentMetadataShape),
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
  z.object({ ...videoDocumentMetadataShape, absolutePath: z.string(), root: z.string() }),
  z.object({ ...binaryDocumentMetadataShape, absolutePath: z.string(), root: z.string() }),
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
