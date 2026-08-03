import { execFileSync } from 'node:child_process'
import { lstatSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureAttentionEnvironment } from '../../server/modules/attention/adapters/attention-environment'
import { prepareE2eAttentionEnvironment } from '../../scripts/e2e-attention-environment'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

describe('prepareE2eAttentionEnvironment', () => {
  it('loads through the native Node TypeScript resolver', () => {
    expect(() => execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      'await import("./scripts/e2e-attention-environment.ts")',
    ], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow()
  })

  it('creates a private production-compatible environment isolated by run id', () => {
    const runId = `test-${process.pid}-${Date.now()}`
    const environment: NodeJS.ProcessEnv = { NODE_ENV: 'production' }
    const root = prepareE2eAttentionEnvironment(runId, environment)
    roots.push(root)

    const directory = join(root, 'bitveins')
    const environmentFile = join(directory, 'env')
    expect(environment.XDG_CONFIG_HOME).toBe(root)
    expect(lstatSync(directory).mode & 0o777).toBe(0o700)
    expect(lstatSync(environmentFile).mode & 0o777).toBe(0o600)
    expect(() => ensureAttentionEnvironment(environment)).not.toThrow()
  })

  it('keeps configured fixture secrets aligned with the private environment file', () => {
    const runId = `configured-${process.pid}-${Date.now()}`
    const environment: NodeJS.ProcessEnv = {
      BITVEINS_EVENT_TOKEN: 'e'.repeat(64),
      BITVEINS_VAPID_PRIVATE_KEY: 'p'.repeat(43),
      BITVEINS_VAPID_PUBLIC_KEY: 'u'.repeat(87),
      NODE_ENV: 'production',
    }
    const root = prepareE2eAttentionEnvironment(runId, environment)
    roots.push(root)

    expect(ensureAttentionEnvironment(environment)).toEqual({
      eventToken: environment.BITVEINS_EVENT_TOKEN,
      vapidPrivateKey: environment.BITVEINS_VAPID_PRIVATE_KEY,
      vapidPublicKey: environment.BITVEINS_VAPID_PUBLIC_KEY,
    })
  })

  it('rejects unsafe run ids before creating files', () => {
    expect(() => prepareE2eAttentionEnvironment('../shared', {})).toThrow(
      'E2E run id contains unsupported characters.',
    )
  })
})
