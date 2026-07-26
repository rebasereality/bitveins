export interface InstallationCleaner {
  purgeData(): Promise<void>
}
