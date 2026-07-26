import { describe, expect, it } from 'vitest'
import {
  explorerDocumentMetadataSchema,
  explorerFileQuerySchema,
  resolveTerminalFileReferencesBodySchema,
  terminalFileResolutionSchema,
} from '#shared/contracts/explorer'

describe('Explorer contracts', () => {
  it('accepts text and supported raster metadata', () => {
    expect(explorerDocumentMetadataSchema.parse({
      kind: 'text',
      path: 'src/file.ts',
      name: 'file.ts',
      size: 12,
    })).toMatchObject({ kind: 'text' })
    expect(explorerDocumentMetadataSchema.parse({
      kind: 'image',
      path: 'design/preview.png',
      name: 'preview.png',
      size: 20,
      mediaType: 'image/png',
    })).toMatchObject({ kind: 'image', mediaType: 'image/png' })
    expect(explorerDocumentMetadataSchema.safeParse({
      kind: 'image',
      path: 'unsafe.svg',
      name: 'unsafe.svg',
      size: 20,
      mediaType: 'image/svg+xml',
    }).success).toBe(false)
  })

  it('bounds queries and resolution batches', () => {
    expect(explorerFileQuerySchema.parse({ path: ' src/file.ts ' })).toEqual({ path: 'src/file.ts' })
    expect(resolveTerminalFileReferencesBodySchema.parse({
      windowId: '@7',
      rememberedRoot: 'project',
      references: [{ path: 'src/file.ts', line: 4, column: 2 }],
    })).toMatchObject({ windowId: '@7', references: [{ line: 4 }] })
    expect(resolveTerminalFileReferencesBodySchema.safeParse({
      windowId: '@7',
      references: [],
    }).success).toBe(false)
  })

  it.each([
    { status: 'missing', reference: { path: 'missing.ts' } },
    {
      status: 'unique',
      reference: { path: 'src/file.ts' },
      document: { kind: 'text', path: 'project/src/file.ts', name: 'file.ts', size: 1, absolutePath: '/workspace/project/src/file.ts', root: 'project' },
    },
    {
      status: 'ambiguous',
      reference: { path: 'src/file.ts' },
      candidates: [
        { kind: 'text', path: 'one/src/file.ts', name: 'file.ts', size: 1, absolutePath: '/workspace/one/src/file.ts', root: 'one' },
        { kind: 'text', path: 'two/src/file.ts', name: 'file.ts', size: 1, absolutePath: '/workspace/two/src/file.ts', root: 'two' },
      ],
    },
  ])('parses $status file resolutions', (resolution) => {
    expect(terminalFileResolutionSchema.parse(resolution)).toMatchObject(resolution)
  })
})
