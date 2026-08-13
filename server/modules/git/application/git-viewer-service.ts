import type { GitCommitDetails, GitFileDiff, GitGraphResponse } from '#shared/contracts/git'
import type { GitRepository } from '../ports/git-repository'

export class GitViewerService {
  constructor(private readonly repository: GitRepository) {}

  list(path: string, offset: number, limit: number): Promise<GitGraphResponse> {
    return this.repository.list(path, offset, limit)
  }

  details(path: string, commit: string): Promise<GitCommitDetails> {
    return this.repository.details(path, commit)
  }

  diff(path: string, commit: string, filePath: string): Promise<GitFileDiff> {
    return this.repository.diff(path, commit, filePath)
  }
}
