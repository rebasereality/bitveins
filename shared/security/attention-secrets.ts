import { generateKeyPairSync, randomBytes } from 'node:crypto'

export interface AttentionSecrets {
  eventToken: string
  vapidPrivateKey: string
  vapidPublicKey: string
}

export function generateAttentionSecrets(): AttentionSecrets {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  })
  const jwk = privateKey.export({ format: 'jwk' })
  if (!jwk.d || !jwk.x || !jwk.y) {
    throw new Error('Unable to generate VAPID key material.')
  }
  return {
    eventToken: randomBytes(48).toString('base64url'),
    vapidPrivateKey: jwk.d,
    vapidPublicKey: Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, 'base64url'),
      Buffer.from(jwk.y, 'base64url'),
    ]).toString('base64url'),
  }
}

export function migrateAttentionSecrets(content: string): {
  content: string
  secrets: AttentionSecrets
} {
  const keys = {
    eventToken: 'BITVEINS_EVENT_TOKEN',
    vapidPrivateKey: 'BITVEINS_VAPID_PRIVATE_KEY',
    vapidPublicKey: 'BITVEINS_VAPID_PUBLIC_KEY',
  } as const
  const configured = Object.fromEntries(Object.entries(keys).map(([property, key]) => {
    const match = content.match(new RegExp(`^${key}="([A-Za-z0-9_-]+)"$`, 'mu'))
    return [property, match?.[1]]
  })) as Partial<AttentionSecrets>
  const values = Object.values(configured)
  if (values.every(Boolean)) return { content, secrets: configured as AttentionSecrets }
  if (values.some(Boolean)) throw new Error('Bitveins attention secrets must be configured together.')

  const secrets = generateAttentionSecrets()
  const additions = [
    `BITVEINS_EVENT_TOKEN="${secrets.eventToken}"`,
    `BITVEINS_VAPID_PRIVATE_KEY="${secrets.vapidPrivateKey}"`,
    `BITVEINS_VAPID_PUBLIC_KEY="${secrets.vapidPublicKey}"`,
  ].join('\n')
  return {
    content: `${content.trimEnd()}\n${additions}\n`,
    secrets,
  }
}
