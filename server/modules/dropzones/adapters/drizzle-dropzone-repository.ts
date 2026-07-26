import { asc } from 'drizzle-orm'
import { dropzones as dropzonesTable } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { Dropzone } from '../model/dropzone'
import type { DropzoneRepository } from '../ports/dropzone-repository'

export class DrizzleDropzoneRepository implements DropzoneRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  list(): Dropzone[] {
    return this.database
      .select({
        name: dropzonesTable.name,
        path: dropzonesTable.path,
      })
      .from(dropzonesTable)
      .orderBy(asc(dropzonesTable.id))
      .all()
  }

  replace(dropzones: readonly Dropzone[], createdAt: number): void {
    this.database.transaction((transaction) => {
      transaction.delete(dropzonesTable).run()
      if (dropzones.length > 0) {
        transaction.insert(dropzonesTable)
          .values(dropzones.map(dropzone => ({
            ...dropzone,
            createdAt,
          })))
          .run()
      }
    })
  }
}
