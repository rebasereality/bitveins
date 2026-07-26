import { describe, expect, it, vi } from 'vitest'
import type { Bundle, VerifyOptions } from 'sigstore'
import {
  OfficialSigstoreSignatureVerifier,
  type SigstoreVerify,
} from '../../../cli/platform/sigstore-release-provenance-verifier'

describe('OfficialSigstoreSignatureVerifier', () => {
  it('delegates cryptographic verification to the official implementation', async () => {
    const verify = vi.fn<SigstoreVerify>(async () => undefined)
    const bundle = {} as Bundle
    const options: VerifyOptions = {
      certificateIssuer: 'https://issuer.example',
    }

    await new OfficialSigstoreSignatureVerifier(verify).verify(bundle, options)

    expect(verify).toHaveBeenCalledWith(bundle, options)
  })
})
