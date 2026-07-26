import {
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Bundle, VerifyOptions } from 'sigstore'
import { OfficialSigstoreSignatureVerifier } from '../../../cli/platform/sigstore-release-provenance-verifier'

const temporaryDirectories: string[] = []
const fixturePath = resolve(
  new URL(
    '../../fixtures/sigstore/bundle-v03-dsse.sigstore.json',
    import.meta.url,
  ).pathname,
)

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function verificationOptions(): Promise<VerifyOptions> {
  const cache = await mkdtemp(join(tmpdir(), 'bitveins-sigstore-tuf-'))
  temporaryDirectories.push(cache)
  return {
    retry: { retries: 0 },
    timeout: 100,
    tufCachePath: cache,
    tufForceCache: true,
  }
}

async function fixture(): Promise<Bundle> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as Bundle
}

describe('official Sigstore cryptographic fixture', () => {
  it('verifies a valid signed DSSE bundle without network access', async () => {
    await expect(new OfficialSigstoreSignatureVerifier().verify(
      await fixture(),
      await verificationOptions(),
    )).resolves.toBeUndefined()
  })

  it('rejects the same bundle after signature tampering', async () => {
    const bundle = await fixture()
    const signature = bundle.dsseEnvelope?.signatures[0]
    if (!signature) {
      throw new Error('Sigstore fixture has no DSSE signature.')
    }
    signature.sig = `${signature.sig.slice(0, -2)}AA`

    await expect(new OfficialSigstoreSignatureVerifier().verify(
      bundle,
      await verificationOptions(),
    )).rejects.toThrow()
  })
})
