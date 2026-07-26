export interface DownloadedRelease {
  cleanup(): Promise<void>
  root: string
}

export interface ReleaseSource {
  download(version?: string): Promise<DownloadedRelease>
}
