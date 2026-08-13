import type { GitCommitDetails, GitFileDiff, GitGraphResponse } from '#shared/contracts/git'

export interface GitRepository {
  list(path: string, offset: number, limit: number): Promise<GitGraphResponse>
  details(path: string, commit: string): Promise<GitCommitDetails>
  diff(path: string, commit: string, filePath: string): Promise<GitFileDiff>
}
