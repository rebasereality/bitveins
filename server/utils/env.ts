import { z } from 'zod'

const envSchema = z.object({
  HOST: z.string().optional(),
  PORT: z.string()
    .regex(/^\d{1,5}$/, 'PORT must be a valid TCP port.')
    .refine(value => Number(value) >= 1 && Number(value) <= 65535, 'PORT must be between 1 and 65535.')
    .optional(),
  BITVEINS_AUTH_PASSWORD_HASH: z.string().optional().default(''),
  NUXT_SESSION_PASSWORD: z.string().optional(),
  BITVEINS_AUTH_VERSION: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'BITVEINS_AUTH_VERSION contains unsupported characters.').default('1'),
  BITVEINS_ALLOWED_ORIGINS: z.string().optional(),
  BITVEINS_TMUX_SOCKET_NAME: z.string()
    .regex(/^[A-Za-z0-9_.-]{1,80}$/, 'BITVEINS_TMUX_SOCKET_NAME contains unsupported characters.')
    .optional(),
})

export type BitveinsEnv = z.infer<typeof envSchema>
const MIN_PRODUCTION_SECRET_LENGTH = 32

/**
 * Validates environment variables for Bitveins server.
 * Returns validated env object or throws detailed Zod error.
 */
export function getValidatedEnv(env: Record<string, string | undefined> = process.env): BitveinsEnv {
  const result = envSchema.safeParse(env)

  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    throw new Error(`Invalid Bitveins environment configuration: ${issues}`)
  }

  return result.data
}

export function assertProductionEnv(env: BitveinsEnv, nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv !== 'production') {
    return
  }

  if (!env.NUXT_SESSION_PASSWORD || env.NUXT_SESSION_PASSWORD.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(`NUXT_SESSION_PASSWORD must contain at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`)
  }

  if (!env.BITVEINS_AUTH_PASSWORD_HASH?.trim()) {
    throw new Error('BITVEINS_AUTH_PASSWORD_HASH is required in production.')
  }

  if (env.HOST !== '127.0.0.1') {
    throw new Error('HOST must be exactly 127.0.0.1 in production.')
  }
}
