export interface ReleaseProvenance {
  commit: string
}

export interface ReleaseProvenanceRequest {
  archiveName: string
  bundlePath: string
  digest: string
  version: string
}

export interface ReleaseProvenanceVerifier {
  verify(request: ReleaseProvenanceRequest): Promise<ReleaseProvenance>
}
