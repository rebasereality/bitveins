import { execFileSync } from 'node:child_process'
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path'
import * as tar from 'tar'
import type { ReleaseMetadata } from '../cli/core/release-metadata.ts'
import { sha256File } from '../cli/platform/release-archive.ts'
import {
  normalizeLicenseReport,
  type LicenseOverride,
} from './release/license-report.ts'
import {
  parsePackageVersion,
  releaseArtifactPaths,
} from './release/release-artifact.ts'
import {
  assertContainedSymlinks,
  assertLinuxX64Elf,
  assertMaximumGlibcVersion,
  normalizeTreeTimes,
} from './release/release-filesystem.ts'

const root = resolve(new URL('..', import.meta.url).pathname)
const projectVersion = parsePackageVersion(
  JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as unknown,
)
const expectedNodeVersion = `v${(await readFile(join(root, '.node-version'), 'utf8')).trim()}`
if (process.version !== expectedNodeVersion) {
  throw new Error(
    `Native releases require Node ${expectedNodeVersion}; current runtime is ${process.version}.`,
  )
}
const version = process.env.BITVEINS_VERSION || projectVersion
const artifact = releaseArtifactPaths(root, version)

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('Release artifacts must be built natively on Linux x86_64.')
}

const sourceCommit = execFileSync(
  'git',
  ['rev-parse', 'HEAD'],
  { cwd: root, encoding: 'utf8' },
).trim()
const dirty = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all'],
  { cwd: root, encoding: 'utf8' },
).trim().length > 0
const commit = process.env.BITVEINS_COMMIT || (dirty ? 'unknown' : sourceCommit)
if (process.env.BITVEINS_COMMIT && dirty) {
  throw new Error('Attested releases require a clean source checkout.')
}
if (process.env.BITVEINS_COMMIT && process.env.BITVEINS_COMMIT !== sourceCommit) {
  throw new Error('BITVEINS_COMMIT does not match the checked-out commit.')
}
const stagingDirectory = join(artifact.outputDirectory, 'staging')
const releaseRoot = join(stagingDirectory, artifact.archiveRootName)
const sourceDateEpoch = Number.parseInt(
  process.env.SOURCE_DATE_EPOCH
  || execFileSync('git', ['show', '-s', '--format=%ct', sourceCommit], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  10,
)
const timestamp = new Date(sourceDateEpoch * 1000)

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

await rm(artifact.outputDirectory, { force: true, recursive: true })
await mkdir(join(releaseRoot, 'app'), { recursive: true })
await mkdir(join(releaseRoot, 'bin'), { recursive: true })
await mkdir(join(releaseRoot, 'docs'), { recursive: true })
await mkdir(join(releaseRoot, 'lib'), { recursive: true })
await mkdir(join(releaseRoot, 'runtime', 'bin'), { recursive: true })
await mkdir(join(releaseRoot, 'share', 'bitveins'), { recursive: true })
await mkdir(join(releaseRoot, 'share', 'bitveins', 'hermes-plugin'), { recursive: true })
await mkdir(join(releaseRoot, 'share', 'systemd', 'user'), { recursive: true })
await mkdir(join(releaseRoot, 'share', 'licenses'), { recursive: true })

const outputRoot = await realpath(join(root, '.output'))
await assertContainedSymlinks(outputRoot, outputRoot)
await cp(join(root, '.output'), join(releaseRoot, 'app', '.output'), {
  dereference: true,
  recursive: true,
})
await copyFile(
  join(root, '.bitveins-build', 'cli', 'index.mjs'),
  join(releaseRoot, 'lib', 'cli.mjs'),
)
await copyFile(
  join(root, '.bitveins-build', 'cli', 'index.mjs.map'),
  join(releaseRoot, 'lib', 'cli.mjs.map'),
)
await copyFile(join(root, 'packaging', 'bin', 'bitveins'), join(releaseRoot, 'bin', 'bitveins'))
await copyFile(
  join(root, 'packaging', 'systemd', 'bitveins.service'),
  join(releaseRoot, 'share', 'systemd', 'user', 'bitveins.service'),
)
await copyFile(process.execPath, join(releaseRoot, 'runtime', 'bin', 'node'))
await copyFile(join(root, 'LICENSE'), join(releaseRoot, 'LICENSE'))
await copyFile(join(root, 'README.md'), join(releaseRoot, 'README.md'))
for (const file of ['__init__.py', 'plugin.yaml', 'README.md', 'test_plugin.py']) {
  await copyFile(
    join(root, 'integrations', 'hermes-notifications', file),
    join(releaseRoot, 'share', 'bitveins', 'hermes-plugin', file),
  )
}
for (const document of ['ARCHITECTURE.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
  await copyFile(join(root, document), join(releaseRoot, document))
}
for (const document of ['installation.md', 'native-release-format.md']) {
  await copyFile(join(root, 'docs', document), join(releaseRoot, 'docs', document))
}
await chmod(join(releaseRoot, 'bin', 'bitveins'), 0o755)
await chmod(join(releaseRoot, 'runtime', 'bin', 'node'), 0o755)

const rawLicenses: unknown = JSON.parse(execFileSync(
  'pnpm',
  ['licenses', 'list', '--prod', '--json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
))
const licenseOverrides: Record<string, LicenseOverride | undefined> = {
  'vaul-vue': {
    license: 'MIT',
    source: 'https://github.com/unovue/vaul-vue/blob/main/LICENSE',
  },
}
const thirdPartyPackages = normalizeLicenseReport(rawLicenses, licenseOverrides)
await writeFile(
  join(releaseRoot, 'share', 'bitveins', 'THIRD_PARTY_LICENSES.json'),
  `${JSON.stringify(thirdPartyPackages, null, 2)}\n`,
  { mode: 0o644 },
)
await copyFile(
  join(root, 'packaging', 'licenses', 'vaul-vue-MIT.txt'),
  join(releaseRoot, 'share', 'licenses', 'vaul-vue-MIT.txt'),
)

const nodeLicense = join(dirname(dirname(process.execPath)), 'LICENSE')
if ((await stat(nodeLicense)).isFile()) {
  await copyFile(nodeLicense, join(releaseRoot, 'share', 'bitveins', 'NODE-LICENSE'))
}

const betterSqlitePrebuilds = join(
  releaseRoot,
  'app',
  '.output',
  'server',
  'node_modules',
  'better-sqlite3',
  'prebuilds',
)
for (const entry of await readdir(betterSqlitePrebuilds)) {
  if (entry !== 'linux-x64.node') {
    await rm(join(betterSqlitePrebuilds, entry), { force: true })
  }
}

const sharpNative = await findSingleFile(
  join(releaseRoot, 'app', '.output', 'server', 'node_modules', '@img', 'sharp-linux-x64', 'lib'),
  name => name.endsWith('.node'),
  'Sharp native module',
)
const sharpLibvips = await findSingleFile(
  join(releaseRoot, 'app', '.output', 'server', 'node_modules', '@img', 'sharp-libvips-linux-x64', 'lib'),
  name => name.startsWith('libvips-cpp.so.'),
  'Sharp libvips library',
)
const nativeExecutables = [
  process.execPath,
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
  join(betterSqlitePrebuilds, 'linux-x64.node'),
  sharpNative,
  sharpLibvips,
]
await Promise.all(nativeExecutables.map(async (path) => {
  await assertLinuxX64Elf(path)
  if (commit !== 'unknown') {
    await assertMaximumGlibcVersion(path)
  }
}))

const metadata = {
  architecture: 'x64',
  commit,
  nodeVersion: process.version,
  platform: 'linux',
  version,
} satisfies ReleaseMetadata
const metadataContent = `${JSON.stringify(metadata, null, 2)}\n`
await writeFile(
  join(releaseRoot, 'share', 'bitveins', 'release.json'),
  metadataContent,
  { mode: 0o644 },
)
await writeFile(artifact.manifestPath, metadataContent, { mode: 0o644 })

await normalizeTreeTimes(releaseRoot, timestamp)
await tar.c({
  cwd: stagingDirectory,
  file: artifact.archivePath,
  gzip: true,
  mtime: timestamp,
  portable: true,
  strict: true,
}, [artifact.archiveRootName])

await writeFile(
  artifact.checksumPath,
  `${await sha256File(artifact.archivePath)}  ${basename(artifact.archivePath)}\n`,
  { mode: 0o644 },
)
await rm(stagingDirectory, { force: true, recursive: true })

// eslint-disable-next-line no-console
console.log(`Built ${artifact.archivePath}`)
