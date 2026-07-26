import { readFile } from 'node:fs/promises'
import {
  verify as verifySigstoreBundle,
  type Bundle,
  type VerifyOptions,
} from 'sigstore'
import { CliIntegrityError } from '../core/cli-error'
import type {
  ReleaseProvenance,
  ReleaseProvenanceRequest,
  ReleaseProvenanceVerifier,
} from '../ports/release-provenance-verifier'

const statementType = 'https://in-toto.io/Statement/v1'
const provenanceType = 'https://slsa.dev/provenance/v1'
const githubWorkflowBuildType
  = 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1'
const githubHostedBuilder = 'https://github.com/actions/runner/github-hosted'
const commitPattern = /^[0-9a-f]{40}$/u

export interface ProvenancePolicy {
  repository: string
  tagPrefix: string
  workflowName: string
  workflowPath: string
}

export interface SignatureVerifier {
  verify(bundle: Bundle, options: VerifyOptions): Promise<void>
}

export type SigstoreVerify = (
  bundle: Bundle,
  options: VerifyOptions,
) => Promise<unknown>

const defaultPolicy: ProvenancePolicy = {
  repository: 'rebasereality/bitveins',
  tagPrefix: 'v',
  workflowName: 'Release',
  workflowPath: '.github/workflows/release.yml',
}

export class OfficialSigstoreSignatureVerifier implements SignatureVerifier {
  constructor(
    private readonly verifier: SigstoreVerify = verifySigstoreBundle,
  ) {}

  async verify(bundle: Bundle, options: VerifyOptions): Promise<void> {
    await this.verifier(bundle, options)
  }
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliIntegrityError(
      `Release attestation ${label} must be an object.`,
    )
  }
  return value as Record<string, unknown>
}

function bundle(value: unknown): Bundle {
  const candidate = record(value, 'bundle')
  if (
    typeof candidate.mediaType !== 'string'
    || !candidate.verificationMaterial
    || !candidate.dsseEnvelope
  ) {
    throw new CliIntegrityError('Release attestation bundle is invalid.')
  }
  return candidate as Bundle
}

function payload(value: Bundle): Record<string, unknown> {
  if (!value.dsseEnvelope) {
    throw new CliIntegrityError(
      'Release attestation does not contain a DSSE envelope.',
    )
  }
  try {
    return record(
      JSON.parse(
        Buffer.from(value.dsseEnvelope.payload, 'base64').toString('utf8'),
      ),
      'statement',
    )
  }
  catch (error) {
    if (error instanceof CliIntegrityError) {
      throw error
    }
    throw new CliIntegrityError(
      'Release attestation statement is not valid JSON.',
      { cause: error },
    )
  }
}

export class SigstoreReleaseProvenanceVerifier
implements ReleaseProvenanceVerifier {
  constructor(
    private readonly policy: ProvenancePolicy = defaultPolicy,
    private readonly signatures: SignatureVerifier
      = new OfficialSigstoreSignatureVerifier(),
  ) {}

  async verify(
    request: ReleaseProvenanceRequest,
  ): Promise<ReleaseProvenance> {
    let serialized: unknown
    try {
      serialized = JSON.parse(
        await readFile(request.bundlePath, 'utf8'),
      ) as unknown
    }
    catch (error) {
      throw new CliIntegrityError(
        'Release attestation bundle is not valid JSON.',
        { cause: error },
      )
    }
    const parsed = bundle(serialized)
    const ref = `refs/tags/${this.policy.tagPrefix}${request.version}`
    const repositoryUri = `https://github.com/${this.policy.repository}`
    const identity = [
      'https://github.com',
      this.policy.repository,
      `${this.policy.workflowPath}@${ref}`,
    ].join('/')
    const provenance = this.verifyStatement(payload(parsed), request, ref)

    try {
      await this.signatures.verify(parsed, {
        certificateIdentityURI: `^${escapeRegularExpression(identity)}$`,
        certificateIssuer: 'https://token.actions.githubusercontent.com',
        certificateOIDs: {
          '1.3.6.1.4.1.57264.1.2': 'push',
          '1.3.6.1.4.1.57264.1.3': provenance.commit,
          '1.3.6.1.4.1.57264.1.4': this.policy.workflowName,
          '1.3.6.1.4.1.57264.1.5': this.policy.repository,
          '1.3.6.1.4.1.57264.1.6': ref,
          '1.3.6.1.4.1.57264.1.11': 'github-hosted',
          '1.3.6.1.4.1.57264.1.12': repositoryUri,
          '1.3.6.1.4.1.57264.1.13': provenance.commit,
          '1.3.6.1.4.1.57264.1.14': ref,
          '1.3.6.1.4.1.57264.1.18': identity,
          '1.3.6.1.4.1.57264.1.19': provenance.commit,
          '1.3.6.1.4.1.57264.1.20': 'push',
          '1.3.6.1.4.1.57264.1.22': 'public',
        },
      })
    }
    catch (error) {
      throw new CliIntegrityError(
        'Release provenance signature or workflow identity is invalid.',
        { cause: error },
      )
    }

    return provenance
  }

  private verifyStatement(
    statement: Record<string, unknown>,
    request: ReleaseProvenanceRequest,
    ref: string,
  ): ReleaseProvenance {
    if (
      statement._type !== statementType
      || statement.predicateType !== provenanceType
    ) {
      throw new CliIntegrityError(
        'Release attestation has an unsupported statement type.',
      )
    }

    const subjects = statement.subject
    if (!Array.isArray(subjects)) {
      throw new CliIntegrityError(
        'Release attestation contains no subjects.',
      )
    }
    const expectedSubject = subjects.some((subject) => {
      const candidate = record(subject, 'subject')
      const digest = record(candidate.digest, 'subject digest')
      return candidate.name === request.archiveName
        && digest.sha256 === request.digest
    })
    if (!expectedSubject) {
      throw new CliIntegrityError(
        'Release attestation does not cover the downloaded archive digest.',
      )
    }

    const predicate = record(statement.predicate, 'predicate')
    const definition = record(
      predicate.buildDefinition,
      'build definition',
    )
    const external = record(
      definition.externalParameters,
      'external parameters',
    )
    const workflow = record(external.workflow, 'workflow')
    const internal = record(
      definition.internalParameters,
      'internal parameters',
    )
    const github = record(internal.github, 'GitHub parameters')
    const details = record(predicate.runDetails, 'run details')
    const builder = record(details.builder, 'builder')
    if (
      definition.buildType !== githubWorkflowBuildType
      || workflow.ref !== ref
      || workflow.repository !== `https://github.com/${this.policy.repository}`
      || this.normalizeWorkflowPath(workflow.path) !== this.policy.workflowPath
      || github.event_name !== 'push'
      || builder.id !== githubHostedBuilder
    ) {
      throw new CliIntegrityError(
        'Release attestation provenance does not match the trusted workflow.',
      )
    }

    const dependencies = definition.resolvedDependencies
    if (!Array.isArray(dependencies)) {
      throw new CliIntegrityError(
        'Release attestation contains no resolved source dependency.',
      )
    }
    const sourceUri = `git+https://github.com/${this.policy.repository}@${ref}`
    for (const dependency of dependencies) {
      const candidate = record(dependency, 'resolved dependency')
      const digest = record(candidate.digest, 'source digest')
      if (
        candidate.uri === sourceUri
        && typeof digest.gitCommit === 'string'
        && commitPattern.test(digest.gitCommit)
      ) {
        return { commit: digest.gitCommit }
      }
    }
    throw new CliIntegrityError(
      'Release attestation does not identify the trusted source commit.',
    )
  }

  private normalizeWorkflowPath(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }
    return value.startsWith('/') ? value.slice(1) : value
  }
}
