import type { Dropzone } from '../model/dropzone'

export interface DropzoneRepository {
  list(): Dropzone[]
  replace(dropzones: readonly Dropzone[], createdAt: number): void
}
