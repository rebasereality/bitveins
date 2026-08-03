import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readRequestBody } from '../../../server/utils/request-validation'

function event(headers: Record<string, string | undefined>) {
  return { node: { req: { headers } } } as Parameters<typeof readRequestBody>[0]
}

describe('readRequestBody size limits', () => {
  it('rejects chunked or unknown-length bodies before reading bounded endpoints', async () => {
    await expect(readRequestBody(
      event({ 'transfer-encoding': 'chunked' }),
      z.object({ value: z.string() }),
      16_384,
      true,
    )).rejects.toMatchObject({ statusCode: 411 })

    await expect(readRequestBody(
      event({}),
      z.object({ value: z.string() }),
      16_384,
      true,
    )).rejects.toMatchObject({ statusCode: 411 })
  })

  it('rejects a declared body larger than the endpoint limit', async () => {
    await expect(readRequestBody(
      event({ 'content-length': '16385' }),
      z.object({ value: z.string() }),
      16_384,
      true,
    )).rejects.toMatchObject({ statusCode: 413 })
  })
})
