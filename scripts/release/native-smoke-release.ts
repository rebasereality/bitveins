import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { parseReleaseMetadata } from '../../cli/core/release-metadata.ts'

export async function setReleaseVersion(
  path: string,
  version: string,
): Promise<void> {
  const metadataPath = join(path, 'share', 'bitveins', 'release.json')
  const metadata = parseReleaseMetadata(
    JSON.parse(await readFile(metadataPath, 'utf8')) as unknown,
  )
  await writeFile(
    metadataPath,
    `${JSON.stringify({ ...metadata, version }, null, 2)}\n`,
    { mode: 0o644 },
  )
}

export async function expectMissing(path: string): Promise<void> {
  try {
    await access(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`Expected native smoke path to be absent: ${path}`)
}
