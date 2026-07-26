import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import {
  parseReleaseMetadata,
} from '../core/release-metadata.ts'
import type { ReleaseBundle } from '../ports/release-store'

export async function loadReleaseBundle(root: string): Promise<ReleaseBundle> {
  const metadataPath = join(root, 'share', 'bitveins', 'release.json')
  const metadata = parseReleaseMetadata(JSON.parse(await readFile(metadataPath, 'utf8')))

  for (const requiredPath of [
    join(root, 'app', '.output', 'server', 'index.mjs'),
    join(root, 'bin', 'bitveins'),
    join(root, 'runtime', 'bin', 'node'),
  ]) {
    await access(requiredPath, constants.R_OK)
  }

  await access(join(root, 'bin', 'bitveins'), constants.X_OK)
  await access(join(root, 'runtime', 'bin', 'node'), constants.X_OK)

  return { metadata, root }
}
