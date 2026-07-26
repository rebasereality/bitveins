import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  Bundle,
  VerifyOptions,
} from 'sigstore'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  SigstoreReleaseProvenanceVerifier,
  type ProvenancePolicy,
  type SignatureVerifier,
} from '../../../cli/platform/sigstore-release-provenance-verifier'

const temporaryDirectories: string[] = []
const commit = 'a'.repeat(40)
const digest = 'b'.repeat(64)
const policy: ProvenancePolicy = {
  repository: 'rebasereality/bitveins',
  tagPrefix: 'v',
  workflowName: 'Release',
  workflowPath: '.github/workflows/release.yml',
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

class RecordingSignatureVerifier implements SignatureVerifier {
  readonly options: VerifyOptions[] = []
  error: Error | null = null

  async verify(_bundle: Bundle, options: VerifyOptions): Promise<void> {
    this.options.push(options)
    if (this.error) {
      throw this.error
    }
  }
}

function statement(options: {
  archiveName?: string
  digest?: string
  repository?: string
  runner?: string
} = {}) {
  const archiveName = options.archiveName
    ?? 'bitveins-v1.2.3-linux-x64.tar.gz'
  const repository = options.repository ?? policy.repository
  const ref = 'refs/tags/v1.2.3'
  return {
    _type: 'https://in-toto.io/Statement/v1',
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            path: `/${policy.workflowPath}`,
            ref,
            repository: `https://github.com/${repository}`,
          },
        },
        internalParameters: {
          github: {
            event_name: 'push',
          },
        },
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        resolvedDependencies: [{
          digest: { gitCommit: commit },
          uri: `git+https://github.com/${repository}@${ref}`,
        }],
      },
      runDetails: {
        builder: {
          id: options.runner === 'self-hosted'
            ? 'https://github.com/actions/runner/self-hosted'
            : 'https://github.com/actions/runner/github-hosted',
        },
      },
    },
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{
      digest: { sha256: options.digest ?? digest },
      name: archiveName,
    }],
  }
}

function serializedBundle(payload: unknown) {
  return {
    dsseEnvelope: {
      payload: Buffer.from(JSON.stringify(payload)).toString('base64'),
      payloadType: 'application/vnd.in-toto+json',
      signatures: [{ keyid: '', sig: 'fixture' }],
    },
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: {
      certificate: { rawBytes: 'fixture' },
      timestampVerificationData: undefined,
      tlogEntries: [],
    },
  }
}

async function fixture(payload: unknown) {
  const directory = await mkdtemp(join(tmpdir(), 'bitveins-provenance-'))
  temporaryDirectories.push(directory)
  const bundlePath = join(directory, 'attestation.sigstore.json')
  await writeFile(bundlePath, JSON.stringify(serializedBundle(payload)))
  return bundlePath
}

async function serializedFixture(value: unknown) {
  const directory = await mkdtemp(join(tmpdir(), 'bitveins-provenance-'))
  temporaryDirectories.push(directory)
  const bundlePath = join(directory, 'attestation.sigstore.json')
  await writeFile(bundlePath, JSON.stringify(value))
  return bundlePath
}

function request(bundlePath: string) {
  return {
    archiveName: 'bitveins-v1.2.3-linux-x64.tar.gz',
    bundlePath,
    digest,
    version: '1.2.3',
  }
}

describe('SigstoreReleaseProvenanceVerifier', () => {
  it('binds digest, repository, workflow, tag and source commit', async () => {
    const signatures = new RecordingSignatureVerifier()
    const verifier = new SigstoreReleaseProvenanceVerifier(
      policy,
      signatures,
    )

    await expect(verifier.verify(request(
      await fixture(statement()),
    ))).resolves.toEqual({ commit })

    expect(signatures.options).toHaveLength(1)
    expect(signatures.options[0]).toMatchObject({
      certificateIssuer: 'https://token.actions.githubusercontent.com',
      certificateOIDs: {
        '1.3.6.1.4.1.57264.1.2': 'push',
        '1.3.6.1.4.1.57264.1.3': commit,
        '1.3.6.1.4.1.57264.1.4': 'Release',
        '1.3.6.1.4.1.57264.1.5': 'rebasereality/bitveins',
        '1.3.6.1.4.1.57264.1.6': 'refs/tags/v1.2.3',
        '1.3.6.1.4.1.57264.1.11': 'github-hosted',
        '1.3.6.1.4.1.57264.1.12':
          'https://github.com/rebasereality/bitveins',
        '1.3.6.1.4.1.57264.1.13': commit,
        '1.3.6.1.4.1.57264.1.14': 'refs/tags/v1.2.3',
        '1.3.6.1.4.1.57264.1.18':
          'https://github.com/rebasereality/bitveins/.github/workflows/release.yml@refs/tags/v1.2.3',
        '1.3.6.1.4.1.57264.1.19': commit,
        '1.3.6.1.4.1.57264.1.20': 'push',
        '1.3.6.1.4.1.57264.1.22': 'public',
      },
    })
  })

  it('rejects a fork, wrong digest and self-hosted runner', async () => {
    const verifier = new SigstoreReleaseProvenanceVerifier(
      policy,
      new RecordingSignatureVerifier(),
    )

    await expect(verifier.verify(request(await fixture(statement({
      repository: 'attacker/bitveins',
    }))))).rejects.toThrow(/trusted workflow/)
    await expect(verifier.verify(request(await fixture(statement({
      digest: 'c'.repeat(64),
    }))))).rejects.toThrow(/downloaded archive digest/)
    await expect(verifier.verify(request(await fixture(statement({
      runner: 'self-hosted',
    }))))).rejects.toThrow(/trusted workflow/)
  })

  it('accepts both canonical GitHub workflow path serializations', async () => {
    const payload = statement()
    payload.predicate.buildDefinition.externalParameters.workflow.path
      = policy.workflowPath

    await expect(new SigstoreReleaseProvenanceVerifier(
      policy,
      new RecordingSignatureVerifier(),
    ).verify(request(await fixture(payload)))).resolves.toEqual({ commit })
  })

  it('wraps a cryptographic or certificate-policy rejection', async () => {
    const signatures = new RecordingSignatureVerifier()
    signatures.error = new Error('untrusted certificate')
    const verifier = new SigstoreReleaseProvenanceVerifier(
      policy,
      signatures,
    )

    await expect(verifier.verify(request(
      await fixture(statement()),
    ))).rejects.toThrow(/signature or workflow identity is invalid/)
  })

  it('rejects an invalid serialized bundle before signature verification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-provenance-'))
    temporaryDirectories.push(directory)
    const bundlePath = join(directory, 'attestation.sigstore.json')
    await writeFile(bundlePath, '{invalid')
    const signatures = new RecordingSignatureVerifier()

    await expect(new SigstoreReleaseProvenanceVerifier(
      policy,
      signatures,
    ).verify(request(bundlePath))).rejects.toThrow(/not valid JSON/)
    expect(signatures.options).toEqual([])
  })

  it('rejects structurally invalid bundles and statements', async () => {
    const verifier = new SigstoreReleaseProvenanceVerifier(
      policy,
      new RecordingSignatureVerifier(),
    )

    await expect(verifier.verify(request(
      await serializedFixture(null),
    ))).rejects.toThrow(/bundle must be an object/)
    await expect(verifier.verify(request(
      await serializedFixture({ mediaType: 'bundle' }),
    ))).rejects.toThrow(/bundle is invalid/)
    await expect(verifier.verify(request(
      await fixture([]),
    ))).rejects.toThrow(/statement must be an object/)
    await expect(verifier.verify(request(
      await fixture({ ...statement(), _type: 'unsupported' }),
    ))).rejects.toThrow(/unsupported statement type/)
    await expect(verifier.verify(request(
      await fixture({ ...statement(), subject: null }),
    ))).rejects.toThrow(/contains no subjects/)
  })

  it('rejects invalid payload JSON and incomplete source dependencies', async () => {
    const verifier = new SigstoreReleaseProvenanceVerifier(
      policy,
      new RecordingSignatureVerifier(),
    )
    const invalidPayload = serializedBundle(statement())
    invalidPayload.dsseEnvelope.payload = Buffer.from('{invalid').toString(
      'base64',
    )
    await expect(verifier.verify(request(
      await serializedFixture(invalidPayload),
    ))).rejects.toThrow(/statement is not valid JSON/)

    const completeStatement = statement()
    const missingDependencies = {
      ...completeStatement,
      predicate: {
        ...completeStatement.predicate,
        buildDefinition: {
          ...completeStatement.predicate.buildDefinition,
          resolvedDependencies: null,
        },
      },
    }
    await expect(verifier.verify(request(
      await fixture(missingDependencies),
    ))).rejects.toThrow(/no resolved source dependency/)

    const invalidCommit = statement()
    invalidCommit.predicate.buildDefinition.resolvedDependencies = [{
      digest: { gitCommit: 'not-a-commit' },
      uri: 'git+https://github.com/rebasereality/bitveins@refs/tags/v1.2.3',
    }]
    await expect(verifier.verify(request(
      await fixture(invalidCommit),
    ))).rejects.toThrow(/does not identify the trusted source commit/)
  })
})
