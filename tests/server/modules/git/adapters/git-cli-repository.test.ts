import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { GitCliRepository } from '../../../../../server/modules/git/adapters/git-cli-repository'
import type { GitViewerError } from '../../../../../server/modules/git/model/git-error'
import { NodeCommandRunner } from '../../../../../server/modules/sessions/adapters/tmux/node-command-runner'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

async function git(root: string, ...args: string[]): Promise<string> {
  return (await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8' })).stdout
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-git-viewer-'))
  temporaryDirectories.push(root)
  await git(root, 'init', '-b', 'main')
  await git(root, 'config', 'user.name', 'Bitveins Test')
  await git(root, 'config', 'user.email', 'bitveins@example.test')
  return root
}

async function commit(root: string, message: string): Promise<string> {
  await git(root, 'add', '--all')
  await git(root, 'commit', '-m', message)
  return (await git(root, 'rev-parse', 'HEAD')).trim()
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('GitCliRepository', () => {
  it('lists a decorated graph and pages commits', async () => {
    const root = await repository()
    await writeFile(join(root, 'README.md'), '# Demo\n')
    await commit(root, 'Initial commit')
    await git(root, 'checkout', '-b', 'feature/demo')
    await writeFile(join(root, 'feature.txt'), 'feature\n')
    const featureHash = await commit(root, 'Add feature')
    await git(root, 'checkout', 'main')
    await writeFile(join(root, 'main.txt'), 'main\n')
    await commit(root, 'Update main')
    await git(root, 'merge', '--no-ff', 'feature/demo', '-m', 'Merge feature')

    const viewer = new GitCliRepository({ runner: new NodeCommandRunner() })
    const first = await viewer.list(root, 0, 2)
    const second = await viewer.list(root, 2, 2)

    expect(first).toMatchObject({ repository: root.split('/').at(-1), branch: 'main', hasMore: true })
    expect(first.commits).toHaveLength(2)
    expect(first.commits[0]?.parents).toHaveLength(2)
    expect([...first.commits, ...second.commits].some(item => item.hash === featureHash)).toBe(true)
    expect([...first.commits, ...second.commits].flatMap(item => item.references)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'head', name: 'main' }),
      expect.objectContaining({ kind: 'branch', name: 'feature/demo' }),
    ]))
  })

  it('returns commit details and before/after text for changed files', async () => {
    const root = await repository()
    await writeFile(join(root, 'notes.txt'), 'one\n')
    await commit(root, 'Add notes')
    await writeFile(join(root, 'notes.txt'), 'one\ntwo\n')
    const hash = await commit(root, 'Expand notes')
    const viewer = new GitCliRepository({ runner: new NodeCommandRunner() })

    const details = await viewer.details(root, hash)
    const diff = await viewer.diff(root, hash, 'notes.txt')

    expect(details.commit).toMatchObject({ hash, subject: 'Expand notes' })
    expect(details.files).toEqual([
      expect.objectContaining({ path: 'notes.txt', status: 'modified', additions: 1, deletions: 0, binary: false }),
    ])
    expect(diff).toMatchObject({ before: 'one\n', after: 'one\ntwo\n', binary: false })
  })

  it('tracks renamed files and resolves both blob paths', async () => {
    const root = await repository()
    await writeFile(join(root, 'before.txt'), 'same content\n')
    await commit(root, 'Add original')
    await git(root, 'mv', 'before.txt', 'after.txt')
    const hash = await commit(root, 'Rename file')
    const viewer = new GitCliRepository({ runner: new NodeCommandRunner() })

    const details = await viewer.details(root, hash)
    const diff = await viewer.diff(root, hash, 'after.txt')

    expect(details.files[0]).toMatchObject({ path: 'after.txt', previousPath: 'before.txt', status: 'renamed' })
    expect(diff).toMatchObject({ before: 'same content\n', after: 'same content\n' })
  })

  it('marks binary files and rejects oversized text diffs', async () => {
    const root = await repository()
    await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2, 3]))
    const binaryHash = await commit(root, 'Add binary')
    await writeFile(join(root, 'large.txt'), 'larger than five bytes\n')
    const largeHash = await commit(root, 'Add large text')
    const viewer = new GitCliRepository({ maxDiffBytes: 5, runner: new NodeCommandRunner() })

    await expect(viewer.diff(root, binaryHash, 'binary.dat')).resolves.toMatchObject({ binary: true, before: null, after: null })
    await expect(viewer.diff(root, largeHash, 'large.txt')).rejects.toMatchObject<Partial<GitViewerError>>({ code: 'too-large' })
  })

  it('fails closed outside repositories and for unknown commits or files', async () => {
    const root = await repository()
    await writeFile(join(root, 'README.md'), '# Demo\n')
    const hash = await commit(root, 'Initial commit')
    const viewer = new GitCliRepository({ runner: new NodeCommandRunner() })
    const outside = await mkdtemp(join(tmpdir(), 'bitveins-no-git-'))
    temporaryDirectories.push(outside)

    await expect(viewer.list(outside, 0, 20)).rejects.toMatchObject<Partial<GitViewerError>>({ code: 'not-repository' })
    await expect(viewer.details(root, '0'.repeat(40))).rejects.toMatchObject<Partial<GitViewerError>>({ code: 'commit-not-found' })
    await expect(viewer.diff(root, hash, 'missing.txt')).rejects.toMatchObject<Partial<GitViewerError>>({ code: 'file-not-found' })
  })
})
