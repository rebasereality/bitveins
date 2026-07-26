import { describe, expect, it, vi } from 'vitest'
import { DropzoneService } from '../../../../../server/modules/dropzones/application/dropzone-service'
import type { Dropzone } from '../../../../../server/modules/dropzones/model/dropzone'
import type { DropzoneRepository } from '../../../../../server/modules/dropzones/ports/dropzone-repository'

class RecordingDropzoneRepository implements DropzoneRepository {
  dropzones: Dropzone[] = []
  readonly replace = vi.fn((dropzones: readonly Dropzone[]) => {
    this.dropzones = [...dropzones]
  })

  list(): Dropzone[] {
    return [...this.dropzones]
  }
}

describe('DropzoneService', () => {
  it('lists and atomically replaces dropzones through its repository', () => {
    const repository = new RecordingDropzoneRepository()
    const service = new DropzoneService({
      clock: () => 42,
      repository,
    })
    const dropzones = [
      { name: 'Home', path: '~' },
      { name: 'Projects', path: '~/code' },
    ]

    service.replace(dropzones)

    expect(repository.replace).toHaveBeenCalledWith(dropzones, 42)
    expect(service.list()).toEqual(dropzones)
  })

  it('uses the system clock by default', () => {
    const repository = new RecordingDropzoneRepository()
    const service = new DropzoneService({ repository })

    service.replace([])

    expect(repository.replace.mock.calls[0]?.[1]).toBeTypeOf('number')
  })
})
