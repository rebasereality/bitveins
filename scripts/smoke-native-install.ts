import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as tar from 'tar'
import {
  fakeCosign,
  fakeCurl,
  fakeJournalctl,
  fakeSystemctl,
} from './fixtures/native-install-fakes.ts'
import {
  parsePackageVersion,
  releaseArtifactPaths,
} from './release/release-artifact.ts'
import {
  expectMissing,
  setReleaseVersion,
} from './release/native-smoke-release.ts'

const root = resolve(new URL('..', import.meta.url).pathname)
const packageVersion = parsePackageVersion(
  JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as unknown,
)
const version = process.env.BITVEINS_VERSION || packageVersion
const artifact = releaseArtifactPaths(root, version)
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'bitveins-install-smoke-'))
const home = join(temporaryDirectory, 'home with spaces')
const fakeBin = join(temporaryDirectory, 'fake-bin')
const fakeState = join(temporaryDirectory, 'fake-systemd')
const bootstrapTemporaryDirectory = join(temporaryDirectory, 'bootstrap temporary files')
const passwordFile = join(temporaryDirectory, 'password')
const invalidChecksumFile = join(temporaryDirectory, 'invalid-checksum')
const maliciousArchive = join(temporaryDirectory, 'malicious-release.tar.gz')
const maliciousChecksum = `${maliciousArchive}.sha256`
const attestation = join(temporaryDirectory, 'release.sigstore.json')
const mismatchedManifest = join(temporaryDirectory, 'mismatched-manifest.json')
const password = 'artifact installation smoke passphrase'
const installRoot = join(home, '.local', 'lib', 'bitveins')
const command = join(home, '.local', 'bin', 'bitveins')
async function availablePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate an installation smoke port.'))
        return
      }
      server.close(error => error ? reject(error) : resolvePort(address.port))
    })
  })
}

function run(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  allowFailure = false,
) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    env: environment,
  })

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${executable} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    )
  }
  return result
}

const port = await availablePort()
let environment: NodeJS.ProcessEnv | undefined

try {
  await Promise.all([
    mkdir(fakeBin, { recursive: true }),
    mkdir(fakeState, { recursive: true }),
    mkdir(home, { recursive: true }),
    mkdir(bootstrapTemporaryDirectory, { recursive: true }),
  ])
  const maliciousRootName = artifact.archiveRootName
  const maliciousRoot = join(temporaryDirectory, 'malicious-source', maliciousRootName)
  await mkdir(maliciousRoot, { recursive: true })
  await symlink('/etc/passwd', join(maliciousRoot, 'unexpected-link'))
  await tar.c({
    cwd: join(temporaryDirectory, 'malicious-source'),
    file: maliciousArchive,
    gzip: true,
  }, [maliciousRootName])
  const maliciousHash = createHash('sha256')
    .update(await readFile(maliciousArchive))
    .digest('hex')
  await writeFile(
    maliciousChecksum,
    `${maliciousHash}  ${artifact.archiveName}\n`,
    { mode: 0o600 },
  )
  await Promise.all([
    writeFile(join(fakeBin, 'curl'), fakeCurl),
    writeFile(join(fakeBin, 'cosign'), fakeCosign),
    writeFile(join(fakeBin, 'systemctl'), fakeSystemctl),
    writeFile(join(fakeBin, 'journalctl'), fakeJournalctl),
    writeFile(
      invalidChecksumFile,
      `${'0'.repeat(64)}  ${artifact.archiveName}\n`,
      { mode: 0o600 },
    ),
    writeFile(passwordFile, `${password}\n`, { mode: 0o600 }),
    writeFile(attestation, '{}\n', { mode: 0o600 }),
    writeFile(
      mismatchedManifest,
      (await readFile(artifact.manifestPath, 'utf8')).replace(
        `"version": "${version}"`,
        '"version": "9.9.9"',
      ),
    ),
  ])
  await Promise.all([
    chmod(join(fakeBin, 'curl'), 0o755),
    chmod(join(fakeBin, 'cosign'), 0o755),
    chmod(join(fakeBin, 'systemctl'), 0o755),
    chmod(join(fakeBin, 'journalctl'), 0o755),
  ])

  environment = {
    ...process.env,
    HOME: home,
    PATH: `${fakeBin}:${process.env.PATH}`,
    BITVEINS_SMOKE_ARCHIVE: artifact.archivePath,
    BITVEINS_SMOKE_ATTESTATION: attestation,
    BITVEINS_SMOKE_CHECKSUM: artifact.checksumPath,
    BITVEINS_SMOKE_LATEST_VERSION: version,
    BITVEINS_SMOKE_MANIFEST: artifact.manifestPath,
    BITVEINS_VERSION: version,
    BITVEINS_FAKE_SYSTEMD_STATE: fakeState,
    BITVEINS_INSTALL_ROOT: installRoot,
    TMPDIR: bootstrapTemporaryDirectory,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
  }

  const rejected = run(
    'sh',
    [join(root, 'install.sh'), '--port', String(port), '--password-file', passwordFile],
    { ...environment, BITVEINS_SMOKE_CHECKSUM: invalidChecksumFile },
    true,
  )
  if (rejected.status === 0) {
    throw new Error('Bootstrap accepted an invalid release checksum.')
  }
  if ((await readdir(bootstrapTemporaryDirectory)).length > 0) {
    throw new Error('Bootstrap temporary files remained after checksum rejection.')
  }

  const invalidProvenance = run(
    'sh',
    [join(root, 'install.sh'), '--port', String(port), '--password-file', passwordFile],
    { ...environment, BITVEINS_SMOKE_PROVENANCE_INVALID: '1' },
    true,
  )
  if (invalidProvenance.status === 0) {
    throw new Error('Bootstrap accepted invalid release provenance.')
  }
  if ((await readdir(bootstrapTemporaryDirectory)).length > 0) {
    throw new Error('Bootstrap temporary files remained after provenance rejection.')
  }

  const manifestMismatch = run(
    'sh',
    [join(root, 'install.sh'), '--port', String(port), '--password-file', passwordFile],
    { ...environment, BITVEINS_SMOKE_MANIFEST: mismatchedManifest },
    true,
  )
  if (manifestMismatch.status === 0) {
    throw new Error('Bootstrap accepted release metadata that differs from its manifest.')
  }
  const unsafeArchive = run(
    'sh',
    [join(root, 'install.sh'), '--port', String(port), '--password-file', passwordFile],
    {
      ...environment,
      BITVEINS_SMOKE_ARCHIVE: maliciousArchive,
      BITVEINS_SMOKE_CHECKSUM: maliciousChecksum,
    },
    true,
  )
  if (unsafeArchive.status === 0) {
    throw new Error('Bootstrap accepted a release archive containing a symbolic link.')
  }
  if ((await readdir(bootstrapTemporaryDirectory)).length > 0) {
    throw new Error('Bootstrap temporary files remained after unsafe archive rejection.')
  }

  const automaticVersionEnvironment = { ...environment }
  delete automaticVersionEnvironment.BITVEINS_VERSION
  const install = run(
    'sh',
    [join(root, 'install.sh'), '--port', String(port), '--password-file', passwordFile],
    automaticVersionEnvironment,
  )
  if (!install.stdout.includes('is ready')) {
    throw new Error(`Installer did not report readiness:\n${install.stdout}`)
  }
  if ((await readdir(bootstrapTemporaryDirectory)).length > 0) {
    throw new Error('Bootstrap temporary files were not removed after installation.')
  }

  const envFile = join(home, '.config', 'bitveins', 'env')
  if (((await stat(envFile)).mode & 0o777) !== 0o600) {
    throw new Error('Installed Bitveins environment file is not mode 0600.')
  }

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    body: JSON.stringify({ password }),
    headers: {
      'content-type': 'application/json',
      'origin': `http://127.0.0.1:${port}`,
    },
    method: 'POST',
  })
  if (login.status !== 200) {
    throw new Error(`Installed Bitveins login failed with HTTP ${login.status}.`)
  }

  const doctor = run(command, ['doctor'], environment)
  if (!doctor.stdout.includes('installation is healthy')) {
    throw new Error(`bitveins doctor failed:\n${doctor.stdout}\n${doctor.stderr}`)
  }

  const updateSources = join(temporaryDirectory, 'update-sources')
  await mkdir(updateSources)
  await tar.x({
    cwd: updateSources,
    file: artifact.archivePath,
    preservePaths: false,
    strict: true,
  })
  const updateSource = join(updateSources, artifact.archiveRootName)
  await setReleaseVersion(updateSource, '0.2.0')
  run(
    join(updateSource, 'bin', 'bitveins'),
    ['install', '--port', String(port)],
    environment,
  )
  const currentLink = join(installRoot, 'current')
  const updatedRelease = join(installRoot, 'releases', '0.2.0')
  if (await readlink(currentLink) !== updatedRelease) {
    throw new Error('Native update smoke did not activate release 0.2.0.')
  }

  const rollbackSource = join(updateSources, 'rollback-source')
  await cp(updateSource, rollbackSource, { recursive: true })
  await setReleaseVersion(rollbackSource, '0.3.0')
  const failedUpdate = run(
    join(rollbackSource, 'bin', 'bitveins'),
    ['install', '--port', String(port)],
    { ...environment, BITVEINS_SMOKE_FAIL_NEXT_RESTART: '1' },
    true,
  )
  if (failedUpdate.status === 0) {
    throw new Error('Native update smoke accepted an unhealthy release.')
  }
  if (await readlink(currentLink) !== updatedRelease) {
    throw new Error('Native update smoke did not restore release 0.2.0.')
  }
  await expectMissing(join(installRoot, 'releases', '0.3.0'))
  const recoveredDoctor = run(command, ['doctor'], environment)
  if (!recoveredDoctor.stdout.includes('installation is healthy')) {
    throw new Error('Native rollback smoke did not restore a healthy service.')
  }

  run(command, ['uninstall'], environment)
  await stat(envFile)
  // eslint-disable-next-line no-console
  console.log(`Native installation smoke passed for ${artifact.archiveName}`)
}
finally {
  if (environment) {
    run(join(fakeBin, 'systemctl'), ['--user', 'stop', 'bitveins.service'], environment, true)
  }
  await rm(temporaryDirectory, { force: true, recursive: true })
}
