import type { Dropzone } from '../model/dropzone'
import type { DropzoneRepository } from '../ports/dropzone-repository'

interface DropzoneServiceOptions {
  clock?: () => number
  repository: DropzoneRepository
}

export class DropzoneService {
  private readonly clock: () => number

  constructor(private readonly options: DropzoneServiceOptions) {
    this.clock = options.clock ?? Date.now
  }

  list(): Dropzone[] {
    return this.options.repository.list()
  }

  replace(dropzones: readonly Dropzone[]): void {
    this.options.repository.replace(dropzones, this.clock())
  }
}
