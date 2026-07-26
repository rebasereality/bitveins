import type { ZodType } from 'zod'
import { createError, getQuery, readBody } from 'h3'

function validationError(message: string): never {
  throw createError({
    statusCode: 400,
    statusMessage: message,
  })
}

export function parseRequest<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)

  if (!result.success) {
    validationError(result.error.issues[0]?.message || 'Invalid request payload.')
  }

  return result.data
}

export async function readRequestBody<T>(
  event: Parameters<typeof readBody>[0],
  schema: ZodType<T>,
): Promise<T> {
  return parseRequest(schema, await readBody<unknown>(event))
}

export function readRequestQuery<T>(
  event: Parameters<typeof getQuery>[0],
  schema: ZodType<T>,
): T {
  return parseRequest(schema, getQuery(event))
}
