import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { BitveinsDoctor } from './application/bitveins-doctor'
import { BitveinsInstaller } from './application/bitveins-installer'
import { BitveinsPasswordManager } from './application/bitveins-password-manager'
import { BitveinsUninstaller } from './application/bitveins-uninstaller'
import { BitveinsUpdater } from './application/bitveins-updater'
import { resolveInstallationLayout } from './core/installation-layout'
import { InstallationTransaction } from './application/installation/installation-transaction'
import { FilesystemEnvironmentRepository } from './platform/filesystem-environment-repository'
import { FilesystemInstallationCleaner } from './platform/filesystem-installation-cleaner'
import { FilesystemReleaseStore } from './platform/filesystem-release-store'
import { FilesystemServiceUnitRepository } from './platform/filesystem-service-unit-repository'
import { GitHubReleaseSource } from './platform/github-release-source'
import { NodeCommandRunner } from './platform/node-command-runner'
import { NodeHealthProbe } from './platform/node-health-probe'
import { NodeHostInspector } from './platform/node-host-inspector'
import { FileOperationLock } from './platform/operation-lock'
import { SystemdUserServiceManager } from './platform/systemd-user-service-manager'
import {
  PasswordFileReader,
  TerminalPasswordReader,
} from './platform/terminal-password-reader'
import type { PasswordReader } from './ports/password-reader'
import { CliApplication } from './presentation/cli-application'
import { CommandRegistry } from './presentation/command-registry'
import { ConsoleOutput } from './presentation/console-output'
import { DoctorCommand } from './presentation/commands/doctor-command'
import { HelpCommand } from './presentation/commands/help-command'
import { InstallCommand } from './presentation/commands/install-command'
import { LifecycleCommand } from './presentation/commands/lifecycle-command'
import {
  HashPasswordCommand,
  PasswordCommand,
} from './presentation/commands/password-command'
import {
  LogsCommand,
  StatusCommand,
} from './presentation/commands/service-inspection-command'
import { UninstallCommand } from './presentation/commands/uninstall-command'
import { UpdateCommand } from './presentation/commands/update-command'
import { VersionCommand } from './presentation/commands/version-command'
import { confirmPurge } from './presentation/terminal-purge-confirmation'
import { hashBitveinsPassword } from '../shared/security/password-hasher'

function bundledReleaseRoot(): string {
  if (process.env.BITVEINS_RELEASE_ROOT) {
    return resolve(process.env.BITVEINS_RELEASE_ROOT)
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

export function createCliApplication(version: string): CliApplication {
  const output = new ConsoleOutput()
  const layout = resolveInstallationLayout()
  const commands = new NodeCommandRunner()
  const service = new SystemdUserServiceManager(commands)
  const lock = new FileOperationLock(layout.lockFile)
  const home = resolve(process.env.HOME || homedir())
  const registry = new CommandRegistry()
  const environment = new FilesystemEnvironmentRepository(layout)
  const health = new NodeHealthProbe()
  const host = new NodeHostInspector(commands)
  const releases = new FilesystemReleaseStore(layout)
  const serviceUnit = new FilesystemServiceUnitRepository(layout, home)
  const cleaner = new FilesystemInstallationCleaner(layout)
  const transaction = new InstallationTransaction({
    environment,
    health,
    output,
    releases,
    service,
    serviceUnit,
  })
  const createPasswordReader = (passwordFile?: string): PasswordReader => (
    passwordFile
      ? new PasswordFileReader(resolve(passwordFile))
      : new TerminalPasswordReader()
  )
  const createInstaller = (passwordReader: PasswordReader) => new BitveinsInstaller({
    host,
    layout,
    output,
    passwordReader,
    releases,
    transaction,
  })
  const configuredPort = async () => (await environment.read()).port

  registry.register(new InstallCommand({
    createInstaller,
    createPasswordReader,
    lock,
    releaseRoot: bundledReleaseRoot(),
  }))
  for (const action of ['start', 'stop', 'restart'] as const) {
    registry.register(new LifecycleCommand(action, {
      configuredPort,
      healthCheck: async port => await health.waitUntilHealthy(port),
      lock,
      output,
      service,
    }))
  }
  registry.register(new StatusCommand(service))
  registry.register(new LogsCommand(service))
  registry.register(new DoctorCommand(new BitveinsDoctor({
    environment,
    health,
    host,
    layout,
    output,
    releases,
    service,
  })))
  registry.register(new PasswordCommand({
    createManager: passwordReader => new BitveinsPasswordManager({
      environment,
      health,
      output,
      passwordReader,
      service,
    }),
    createPasswordReader,
    lock,
  }))
  registry.register(new HashPasswordCommand({
    createPasswordReader,
    hashPassword: hashBitveinsPassword,
    output,
  }))
  registry.register(new UpdateCommand(
    new BitveinsUpdater({
      environment,
      installer: createInstaller(new TerminalPasswordReader()),
      output,
      releases: new GitHubReleaseSource(),
      store: releases,
    }),
    lock,
  ))
  registry.register(new UninstallCommand({
    confirmPurge,
    lock,
    uninstaller: new BitveinsUninstaller({
      cleaner,
      output,
      releases,
      service,
      serviceUnit,
    }),
  }))
  registry.register(new VersionCommand(output, version))
  registry.register(new HelpCommand(registry, output, version))

  return new CliApplication({ commands: registry, output })
}

export async function runBitveinsCli(
  argv: readonly string[],
  version: string,
): Promise<number> {
  return await createCliApplication(version).run(argv)
}
