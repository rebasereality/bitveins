import { InstallationTransaction } from '../../../cli/application/installation/installation-transaction'
import { BitveinsInstaller } from '../../../cli/application/bitveins-installer'
import type { InstallationLayout } from '../../../cli/core/installation-layout'
import { FilesystemEnvironmentRepository } from '../../../cli/platform/filesystem-environment-repository'
import { FilesystemReleaseStore } from '../../../cli/platform/filesystem-release-store'
import { FilesystemServiceUnitRepository } from '../../../cli/platform/filesystem-service-unit-repository'
import type { PasswordReader } from '../../../cli/ports/password-reader'
import {
  FakeHealthProbe,
  FakeHostInspector,
  FakeServiceManager,
  RecordingCliOutput,
} from './cli-fakes'

export function createNativeInstallationFixture(options: {
  home: string
  layout: InstallationLayout
  passwordReader: PasswordReader
  health?: FakeHealthProbe
  host?: FakeHostInspector
  output?: RecordingCliOutput
  service?: FakeServiceManager
}) {
  const environment = new FilesystemEnvironmentRepository(options.layout)
  const health = options.health ?? new FakeHealthProbe()
  const host = options.host ?? new FakeHostInspector()
  const output = options.output ?? new RecordingCliOutput()
  const releases = new FilesystemReleaseStore(options.layout)
  const service = options.service ?? new FakeServiceManager()
  const serviceUnit = new FilesystemServiceUnitRepository(
    options.layout,
    options.home,
  )
  const transaction = new InstallationTransaction({
    environment,
    health,
    output,
    releases,
    service,
    serviceUnit,
  })
  const installer = new BitveinsInstaller({
    host,
    layout: options.layout,
    output,
    passwordReader: options.passwordReader,
    releases,
    transaction,
  })

  return {
    environment,
    health,
    host,
    installer,
    output,
    releases,
    service,
    serviceUnit,
    transaction,
  }
}
