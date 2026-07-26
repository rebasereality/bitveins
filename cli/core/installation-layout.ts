import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export interface InstallationLayout {
  binDirectory: string
  commandPath: string
  configDirectory: string
  currentReleaseLink: string
  dataDirectory: string
  environmentFile: string
  installationRoot: string
  lockFile: string
  releasesDirectory: string
  stateDirectory: string
  systemdDirectory: string
  systemdUnit: string
}

export interface LayoutEnvironment {
  HOME?: string
  BITVEINS_BIN_DIR?: string
  BITVEINS_INSTALL_ROOT?: string
  XDG_CONFIG_HOME?: string
  XDG_DATA_HOME?: string
  XDG_STATE_HOME?: string
}

function absoluteOverride(value: string | undefined, fallback: string, name: string): string {
  if (!value) {
    return fallback
  }

  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path.`)
  }

  return resolve(value)
}

export function resolveInstallationLayout(
  environment: LayoutEnvironment = process.env,
): InstallationLayout {
  const home = absoluteOverride(environment.HOME, homedir(), 'HOME')
  const configHome = absoluteOverride(
    environment.XDG_CONFIG_HOME,
    join(home, '.config'),
    'XDG_CONFIG_HOME',
  )
  const dataHome = absoluteOverride(
    environment.XDG_DATA_HOME,
    join(home, '.local', 'share'),
    'XDG_DATA_HOME',
  )
  const stateHome = absoluteOverride(
    environment.XDG_STATE_HOME,
    join(home, '.local', 'state'),
    'XDG_STATE_HOME',
  )
  const binDirectory = absoluteOverride(
    environment.BITVEINS_BIN_DIR,
    join(home, '.local', 'bin'),
    'BITVEINS_BIN_DIR',
  )
  const installationRoot = absoluteOverride(
    environment.BITVEINS_INSTALL_ROOT,
    join(home, '.local', 'lib', 'bitveins'),
    'BITVEINS_INSTALL_ROOT',
  )
  const configDirectory = join(configHome, 'bitveins')
  const stateDirectory = join(stateHome, 'bitveins')

  return {
    binDirectory,
    commandPath: join(binDirectory, 'bitveins'),
    configDirectory,
    currentReleaseLink: join(installationRoot, 'current'),
    dataDirectory: join(dataHome, 'bitveins'),
    environmentFile: join(configDirectory, 'env'),
    installationRoot,
    lockFile: join(stateDirectory, 'operation.lock'),
    releasesDirectory: join(installationRoot, 'releases'),
    stateDirectory,
    systemdDirectory: join(configHome, 'systemd', 'user'),
    systemdUnit: join(configHome, 'systemd', 'user', 'bitveins.service'),
  }
}
