import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  join,
  resolve,
} from 'node:path'
import {
  parseReleaseMetadata,
  releaseMetadataEquals,
} from '../cli/core/release-metadata.ts'
import { ReleaseArchive } from '../cli/platform/release-archive.ts'
import { loadReleaseBundle } from '../cli/platform/release-bundle.ts'
import {
  parsePackageVersion,
  releaseArtifactPaths,
} from './release/release-artifact.ts'
import {
  assertMaximumGlibcVersion,
  assertNoForbiddenContent,
} from './release/release-filesystem.ts'

const root = resolve(new URL('..', import.meta.url).pathname)
const packageVersion = parsePackageVersion(
  JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as unknown,
)
const version = process.env.BITVEINS_VERSION || packageVersion
const artifact = releaseArtifactPaths(root, version)
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'bitveins-verify-'))
const releaseArchive = new ReleaseArchive()

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

async function findSingleFile(
  directory: string,
  predicate: (name: string) => boolean,
  label: string,
): Promise<string> {
  const matches = (await readdir(directory)).filter(predicate)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in ${directory}; found ${matches.length}.`)
  }
  return join(directory, matches[0]!)
}

try {
  const manifest = parseReleaseMetadata(
    JSON.parse(await readFile(artifact.manifestPath, 'utf8')) as unknown,
  )
  if (manifest.version !== version) {
    throw new Error('Release manifest does not match the requested version.')
  }
  await releaseArchive.verifyChecksum(
    artifact.archivePath,
    artifact.checksumPath,
  )
  const releaseRoot = await releaseArchive.extract(
    artifact.archivePath,
    temporaryDirectory,
    artifact.archiveRootName,
  )
  const releaseBundle = await loadReleaseBundle(releaseRoot)
  if (!releaseMetadataEquals(releaseBundle.metadata, manifest)) {
    throw new Error('Archive metadata does not match the release manifest.')
  }
  await assertNoForbiddenContent(
    releaseRoot,
    [...new Set([
      root,
      process.env.GITHUB_WORKSPACE,
    ].filter(isString))],
  )
  const node = join(releaseRoot, 'runtime', 'bin', 'node')
  if (releaseBundle.metadata.commit !== 'unknown') {
    const outputNodeModules = join(releaseRoot, 'app', '.output', 'server', 'node_modules')
    await Promise.all([
      node,
      join(
        releaseRoot,
        'app',
        '.output',
        'server',
        'node_modules',
        'node-pty',
        'build',
        'Release',
        'pty.node',
      ),
      join(
        releaseRoot,
        'app',
        '.output',
        'server',
        'node_modules',
        'better-sqlite3',
        'prebuilds',
        'linux-x64.node',
      ),
      await findSingleFile(
        join(outputNodeModules, '@img', 'sharp-linux-x64', 'lib'),
        name => name.endsWith('.node'),
        'Sharp native module',
      ),
      await findSingleFile(
        join(outputNodeModules, '@img', 'sharp-libvips-linux-x64', 'lib'),
        name => name.startsWith('libvips-cpp.so.'),
        'Sharp libvips library',
      ),
    ].map(path => assertMaximumGlibcVersion(path)))
  }
  const command = join(releaseRoot, 'bin', 'bitveins')
  const cli = spawnSync(command, ['version'], {
    encoding: 'utf8',
    env: { ...process.env, BITVEINS_RELEASE_ROOT: releaseRoot },
  })
  if (cli.status !== 0 || cli.stdout.trim() !== version) {
    throw new Error(`Packaged CLI failed: ${cli.stderr || cli.stdout}`)
  }

  const sharpEntry = join(
    releaseRoot,
    'app',
    '.output',
    'server',
    'node_modules',
    'sharp',
    'dist',
    'index.mjs',
  )
  const nativeProbe = `
    import { createRequire } from 'node:module'
    import { pathToFileURL } from 'node:url'
    const require = createRequire(${JSON.stringify(join(releaseRoot, 'app', '.output', 'server', 'package.json'))})
    const Database = require('better-sqlite3')
    const database = new Database(':memory:')
    database.exec('select 1')
    database.close()
    const pty = require('node-pty')
    if (typeof pty.spawn !== 'function') process.exit(2)
    const sharp = (await import(pathToFileURL(${JSON.stringify(sharpEntry)}).href)).default
    const preview = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#000000' }
    }).png().toBuffer()
    if (preview[0] !== 0x89 || preview[1] !== 0x50) process.exit(3)
  `
  execFileSync(node, ['--input-type=module', '--eval', nativeProbe], {
    stdio: 'pipe',
  })

  // eslint-disable-next-line no-console
  console.log(`Verified ${artifact.archivePath}`)
}
finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}
