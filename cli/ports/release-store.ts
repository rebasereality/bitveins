import type { ReleaseMetadata } from '../core/release-metadata'

export interface ReleaseBundle {
  metadata: ReleaseMetadata
  root: string
}

export interface InstalledRelease {
  bundle: ReleaseBundle
  created: boolean
  path: string
}

export interface ReleaseActivationSnapshot {
  commandTarget: string | null
  currentTarget: string | null
  history: ReleaseActivationHistory | null
}

export interface ReleaseActivationHistory {
  current: string
  previous: string | null
  version: 1
}

export interface ReleaseStore {
  activate(path: string): Promise<void>
  current(): Promise<ReleaseBundle>
  install(source: string): Promise<InstalledRelease>
  load(root: string): Promise<ReleaseBundle>
  prune(): Promise<void>
  recordActivation(path: string, previousTarget: string | null): Promise<void>
  removeInstalledRelease(path: string, label: string): Promise<void>
  removeInstallation(): Promise<void>
  restore(snapshot: ReleaseActivationSnapshot): Promise<void>
  snapshot(): Promise<ReleaseActivationSnapshot>
}
