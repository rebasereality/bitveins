import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateAttentionSecrets, type AttentionSecrets } from '../shared/security/attention-secrets.ts'

export function prepareE2eAttentionEnvironment(
  runId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) {
    throw new Error('E2E run id contains unsupported characters.')
  }

  const root = `/tmp/bitveins-e2e-config-${runId}`
  const directory = join(root, 'bitveins')
  const environmentFile = join(directory, 'env')
  const secrets = resolveFixtureSecrets(environment)

  mkdirSync(directory, { mode: 0o700, recursive: true })
  chmodSync(directory, 0o700)
  writeFileSync(environmentFile, [
    `BITVEINS_EVENT_TOKEN="${secrets.eventToken}"`,
    `BITVEINS_VAPID_PRIVATE_KEY="${secrets.vapidPrivateKey}"`,
    `BITVEINS_VAPID_PUBLIC_KEY="${secrets.vapidPublicKey}"`,
    '',
  ].join('\n'), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  environment.XDG_CONFIG_HOME = root
  return root
}

function resolveFixtureSecrets(environment: NodeJS.ProcessEnv): AttentionSecrets {
  const eventToken = environment.BITVEINS_EVENT_TOKEN
  const vapidPrivateKey = environment.BITVEINS_VAPID_PRIVATE_KEY
  const vapidPublicKey = environment.BITVEINS_VAPID_PUBLIC_KEY
  const values = [eventToken, vapidPrivateKey, vapidPublicKey]
  if (values.every(Boolean)) {
    return {
      eventToken: eventToken!,
      vapidPrivateKey: vapidPrivateKey!,
      vapidPublicKey: vapidPublicKey!,
    }
  }
  if (values.some(Boolean)) {
    throw new Error('E2E attention secrets must be configured together.')
  }
  return generateAttentionSecrets()
}
