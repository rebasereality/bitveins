import { createReadStream } from 'node:fs'
import {
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  utimes,
} from 'node:fs/promises'
import {
  dirname,
  join,
  resolve,
} from 'node:path'

export const maximumReleaseGlibc = '2.34'

interface GlibcVersion {
  major: number
  minor: number
}

function parseGlibcVersion(value: string): GlibcVersion {
  const match = /^(\d+)\.(\d+)$/u.exec(value)
  if (!match) {
    throw new Error(`Invalid glibc version policy: ${value}`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  }
}

function compareGlibcVersions(left: GlibcVersion, right: GlibcVersion): number {
  return left.major - right.major || left.minor - right.minor
}

export function maximumRequiredGlibcVersion(
  content: Uint8Array,
): string | null {
  let maximum: GlibcVersion | null = null
  for (const match of Buffer.from(content)
    .toString('latin1')
    .matchAll(/\bGLIBC_(\d+)\.(\d+)\b/gu)) {
    const candidate = {
      major: Number(match[1]),
      minor: Number(match[2]),
    }
    if (!maximum || compareGlibcVersions(candidate, maximum) > 0) {
      maximum = candidate
    }
  }
  return maximum ? `${maximum.major}.${maximum.minor}` : null
}

export async function assertMaximumGlibcVersion(
  path: string,
  maximum = maximumReleaseGlibc,
): Promise<void> {
  const required = maximumRequiredGlibcVersion(await readFile(path))
  if (
    required
    && compareGlibcVersions(
      parseGlibcVersion(required),
      parseGlibcVersion(maximum),
    ) > 0
  ) {
    throw new Error(
      `${path} requires glibc ${required}, above the release limit ${maximum}.`,
    )
  }
}

export async function assertContainedSymlinks(
  path: string,
  boundary: string,
): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isSymbolicLink()) {
      const target = await realpath(resolve(dirname(child), await readlink(child)))
      if (target !== boundary && !target.startsWith(`${boundary}/`)) {
        throw new Error(`Build output symlink escapes .output: ${child}`)
      }
      continue
    }
    if (entry.isDirectory()) {
      await assertContainedSymlinks(child, boundary)
    }
  }
}

export async function assertLinuxX64Elf(path: string): Promise<void> {
  const header = Buffer.alloc(20)
  const handle = await open(path, 'r')
  try {
    await handle.read(header, 0, header.length, 0)
  }
  finally {
    await handle.close()
  }

  if (
    header[0] !== 0x7f
    || header.subarray(1, 4).toString('ascii') !== 'ELF'
    || header.readUInt16LE(18) !== 62
  ) {
    throw new Error(`${path} is not a Linux x86_64 ELF binary.`)
  }
}

export async function normalizeTreeTimes(
  path: string,
  timestamp: Date,
): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      await normalizeTreeTimes(child, timestamp)
    }
    await utimes(child, timestamp, timestamp)
  }
  await utimes(path, timestamp, timestamp)
}

async function containsBytes(path: string, needle: string): Promise<boolean> {
  const target = Buffer.from(needle)
  let tail = Buffer.alloc(0)

  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.concat([tail, chunk])
    if (buffer.indexOf(target) !== -1) {
      return true
    }
    tail = buffer.subarray(Math.max(0, buffer.length - target.length + 1))
  }
  return false
}

export async function assertNoForbiddenContent(
  path: string,
  forbiddenValues: readonly string[],
): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      await assertNoForbiddenContent(child, forbiddenValues)
      continue
    }
    for (const forbidden of forbiddenValues) {
      if (forbidden && await containsBytes(child, forbidden)) {
        throw new Error(
          `Release file embeds forbidden build-specific content: ${child}`,
        )
      }
    }
  }
}
