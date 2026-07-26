import type { CliOutput } from '../ports/cli-output'
import type { EnvironmentRepository } from '../ports/environment-repository'
import type { ReleaseSource } from '../ports/release-source'
import type { ReleaseStore } from '../ports/release-store'

interface ReleaseInstaller {
  install(options: {
    port: number
    releaseRoot: string
  }): Promise<void>
}

export class BitveinsUpdater {
  constructor(private readonly dependencies: {
    environment: EnvironmentRepository
    installer: ReleaseInstaller
    output: CliOutput
    releases: ReleaseSource
    store: ReleaseStore
  }) {}

  async update(version?: string): Promise<void> {
    const downloaded = await this.dependencies.releases.download(version)

    try {
      const target = await this.dependencies.store.load(downloaded.root)
      const current = await this.dependencies.store.current()
      if (
        target.metadata.version === current.metadata.version
        && target.metadata.commit === current.metadata.commit
      ) {
        this.dependencies.output.info(
          `Bitveins ${target.metadata.version} is already installed.`,
        )
        return
      }

      const environment = await this.dependencies.environment.read()
      await this.dependencies.installer.install({
        port: environment.port,
        releaseRoot: downloaded.root,
      })
      try {
        await this.dependencies.store.prune()
      }
      catch (error) {
        this.dependencies.output.info(
          `Warning: old releases could not be pruned: ${this.message(error)}`,
        )
      }
      this.dependencies.output.success(
        `Updated Bitveins ${current.metadata.version} → ${target.metadata.version}.`,
      )
    }
    finally {
      await downloaded.cleanup()
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
