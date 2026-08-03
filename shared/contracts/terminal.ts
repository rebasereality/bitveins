import { z } from 'zod'

export const tmuxSessionSchema = z.object({
  name: z.string(),
  path: z.string(),
})

export const tmuxWindowSchema = z.object({
  application: z.enum(['hermes']).optional(),
  id: z.string(),
  index: z.number().int(),
  name: z.string(),
  active: z.boolean(),
  path: z.string(),
})

export const historyMessageSchema = z.object({
  id: z.number().int(),
  message: z.string(),
  createdAt: z.number().int(),
})

export type TmuxSession = z.infer<typeof tmuxSessionSchema>
export type TmuxWindow = z.infer<typeof tmuxWindowSchema>
export type HistoryMessage = z.infer<typeof historyMessageSchema>

export interface TerminalSize {
  cols: number
  rows: number
}

const DEFAULT_COLS = 100
const DEFAULT_ROWS = 32
export const MAX_INPUT_BYTES = 64 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function terminalInputByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function isTerminalInputWithinLimit(value: string): boolean {
  return terminalInputByteLength(value) <= MAX_INPUT_BYTES
}

const terminalDimensionsSchema = {
  cols: z.number().finite('Terminal dimensions must be finite numbers.').optional(),
  rows: z.number().finite('Terminal dimensions must be finite numbers.').optional(),
}

const attachSchema = z.object({
  action: z.literal('attach'),
  payload: z.object({
    sessionName: z.string().min(1, 'Attach requires a sessionName string.'),
    ...terminalDimensionsSchema,
  }, { error: 'A payload object is required.' }),
})

const attachWindowSchema = z.object({
  action: z.literal('attachWindow'),
  payload: z.object({
    sessionName: z.string().min(1, 'Attach window requires a sessionName string.'),
    windowIndex: z.number().int('Attach window requires an integer windowIndex.'),
    ...terminalDimensionsSchema,
  }, { error: 'A payload object is required.' }),
})

const inputDataSchema = z.string({ error: 'Input requires a data string.' }).refine(
  isTerminalInputWithinLimit,
  `Input payload exceeds ${MAX_INPUT_BYTES} bytes.`,
)

const inputSchema = z.object({
  action: z.literal('input'),
  payload: z.object({
    data: inputDataSchema,
  }, { error: 'A payload object is required.' }),
})

const wheelInputSchema = z.object({
  action: z.literal('wheelInput'),
  payload: z.object({
    data: inputDataSchema,
    encoding: z.enum(['binary', 'utf8']).optional(),
  }, { error: 'A payload object is required.' }).superRefine((payload, context) => {
    if (payload.encoding === 'binary') {
      const validLegacyReport = payload.data.length === 6
        && payload.data.startsWith('\u001B[M')
        && [96, 97].includes(payload.data.charCodeAt(3))
        && payload.data.charCodeAt(4) >= 33
        && payload.data.charCodeAt(4) <= 255
        && payload.data.charCodeAt(5) >= 33
        && payload.data.charCodeAt(5) <= 255
      if (!validLegacyReport) {
        context.addIssue({
          code: 'custom',
          message: 'Wheel input requires a legacy binary wheel report.',
          path: ['data'],
        })
      }
      return
    }

    if (!/^\u001B\[<6[45];\d+;\d+M$/u.test(payload.data)) {
      context.addIssue({
        code: 'custom',
        message: 'Wheel input requires an SGR wheel report.',
        path: ['data'],
      })
    }
  }),
})

const reliableInputSchema = z.object({
  action: z.literal('reliableInput'),
  payload: z.object({
    id: z.string({ error: 'Reliable input requires a UUID id.' }).regex(UUID_PATTERN, 'Reliable input requires a UUID id.'),
    data: inputDataSchema,
  }, { error: 'A payload object is required.' }),
})

const resizeSchema = z.object({
  action: z.literal('resize'),
  payload: z.object({
    cols: z.number({ error: 'Resize requires finite cols and rows numbers.' }).finite('Resize requires finite cols and rows numbers.'),
    rows: z.number({ error: 'Resize requires finite cols and rows numbers.' }).finite('Resize requires finite cols and rows numbers.'),
  }, { error: 'A payload object is required.' }),
})

const sessionActionSchema = (action: 'newWindow') => z.object({
  action: z.literal(action),
  payload: z.object({
    sessionName: z.string({ error: `${action} requires a sessionName string.` }),
  }, { error: 'A payload object is required.' }),
})

const indexedWindowActionSchema = (action: 'selectWindow' | 'killWindow') => z.object({
  action: z.literal(action),
  payload: z.object({
    sessionName: z.string({ error: `${action} requires a sessionName string.` }),
    index: z.number({ error: `${action} requires an integer index.` }).int(`${action} requires an integer index.`),
  }, { error: 'A payload object is required.' }),
})

export const clientMessageSchema = z.discriminatedUnion('action', [
  attachSchema,
  attachWindowSchema,
  inputSchema,
  reliableInputSchema,
  resizeSchema,
  sessionActionSchema('newWindow'),
  indexedWindowActionSchema('selectWindow'),
  indexedWindowActionSchema('killWindow'),
  wheelInputSchema,
  z.object({ action: z.literal('detach') }),
  z.object({ action: z.literal('ping') }),
])

export const serverMessageSchema = z.union([
  z.object({
    type: z.enum(['stdout', 'error', 'status', 'pong', 'heartbeat']),
    data: z.string(),
  }),
  z.object({
    type: z.literal('attached'),
    data: z.string(),
    sessionName: z.string(),
    windowIndex: z.number().int().optional(),
  }),
  z.object({
    type: z.literal('inputAck'),
    data: z.string(),
    inputId: z.string(),
  }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>

export function parseTerminalSize(cols: unknown, rows: unknown): TerminalSize {
  const parsedCols = Number(cols)
  const parsedRows = Number(rows)

  return {
    cols: Number.isFinite(parsedCols) ? Math.max(20, Math.min(300, Math.floor(parsedCols))) : DEFAULT_COLS,
    rows: Number.isFinite(parsedRows) ? Math.max(8, Math.min(120, Math.floor(parsedRows))) : DEFAULT_ROWS,
  }
}

function parseJson(raw: string, message: string): unknown {
  try {
    return JSON.parse(raw)
  }
  catch {
    throw new Error(message)
  }
}

export function parseClientMessage(raw: string): ClientMessage {
  const parsed = parseJson(raw, 'Invalid WebSocket message.')

  if (typeof parsed !== 'object' || parsed === null || !('action' in parsed) || typeof parsed.action !== 'string') {
    throw new Error('Invalid WebSocket message.')
  }

  const result = clientMessageSchema.safeParse(parsed)
  if (!result.success) {
    const knownAction = clientMessageSchema.options.some(option => option.shape.action.value === parsed.action)
    if (!knownAction) {
      throw new Error(`Unsupported WebSocket action: ${parsed.action}`)
    }
    throw new Error(result.error.issues[0]?.message || 'Invalid WebSocket message.')
  }

  return result.data
}

export function parseServerMessage(raw: string): ServerMessage {
  const result = serverMessageSchema.safeParse(parseJson(raw, 'Invalid server message.'))

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message || 'Invalid server message.')
  }

  return result.data
}
