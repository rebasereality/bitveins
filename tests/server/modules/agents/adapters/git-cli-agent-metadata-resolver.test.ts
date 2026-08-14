import { describe, expect, it } from 'vitest'
import { GitCliAgentMetadataResolver } from '../../../../../server/modules/agents/adapters/git-cli-agent-metadata-resolver'
import type {
  CommandResult,
  CommandRunner,
  CommandRunOptions,
} from '../../../../../server/modules/sessions/adapters/tmux/command-runner'

interface CommandCall {
  args: readonly string[]
  command: string
  options?: CommandRunOptions
}

class FakeCommandRunner implements CommandRunner {
  readonly calls: CommandCall[] = []
  handler: (call: CommandCall) => Promise<CommandResult> = async () => ({ stderr: '', stdout: '' })

  async run(command: string, args: readonly string[], options?: CommandRunOptions): Promise<CommandResult> {
    const call = { args, command, options }
    this.calls.push(call)
    return this.handler(call)
  }
}

describe('GitCliAgentMetadataResolver', () => {
  it('reads a branch from the repository containing the pane path', async () => {
    const runner = new FakeCommandRunner()
    runner.handler = async ({ args }) => ({
      stderr: '',
      stdout: args.includes('symbolic-ref')
        ? 'feature/agent-git-context\n'
        : '/workspace/bitveins\n/workspace/bitveins/.git\n/workspace/bitveins/.git\n',
    })
    const resolver = new GitCliAgentMetadataResolver({ runner, timeoutMs: 321 })

    await expect(resolver.resolve('/workspace/bitveins/server')).resolves.toEqual({
      detached: false,
      linkedWorktree: false,
      reference: 'feature/agent-git-context',
      repository: 'bitveins',
    })
    expect(runner.calls[0]).toMatchObject({
      args: [
        '-C',
        '/workspace/bitveins/server',
        'rev-parse',
        '--path-format=absolute',
        '--show-toplevel',
        '--git-dir',
        '--git-common-dir',
      ],
      command: 'git',
      options: { timeoutMs: 321 },
    })
  })

  it('detects a linked worktree and falls back to the detached commit', async () => {
    const runner = new FakeCommandRunner()
    runner.handler = async ({ args }) => {
      if (args.includes('symbolic-ref')) throw new Error('detached')
      return {
        stderr: '',
        stdout: args.includes('--short')
          ? 'a1b2c3d\n'
          : '/worktrees/review\n/repos/bitveins/.git/worktrees/review\n/repos/bitveins/.git\n',
      }
    }
    const resolver = new GitCliAgentMetadataResolver({ runner })

    await expect(resolver.resolve('/worktrees/review')).resolves.toEqual({
      detached: true,
      linkedWorktree: true,
      reference: 'a1b2c3d',
      repository: 'bitveins',
    })
  })

  it('caches metadata by pane path and refreshes it after the TTL', async () => {
    let now = 10
    const runner = new FakeCommandRunner()
    runner.handler = async ({ args }) => ({
      stderr: '',
      stdout: args.includes('symbolic-ref')
        ? 'main\n'
        : '/workspace/repo\n/workspace/repo/.git\n/workspace/repo/.git\n',
    })
    const resolver = new GitCliAgentMetadataResolver({
      cacheTtlMs: 5,
      clock: () => now,
      runner,
    })

    await resolver.resolve('/workspace/repo')
    await resolver.resolve('/workspace/repo')
    expect(runner.calls).toHaveLength(2)

    now = 15
    await resolver.resolve('/workspace/repo')
    expect(runner.calls).toHaveLength(4)
  })

  it('fails closed outside repositories and for non-absolute pane paths', async () => {
    const runner = new FakeCommandRunner()
    runner.handler = async () => {
      throw new Error('not a repository')
    }
    const resolver = new GitCliAgentMetadataResolver({ runner })

    await expect(resolver.resolve('~')).resolves.toBeNull()
    await expect(resolver.resolve('/tmp')).resolves.toBeNull()
    expect(runner.calls).toHaveLength(1)
  })

  it('handles corrupted output or unresolvable git refs', async () => {
    const runner = new FakeCommandRunner()
    runner.handler = async ({ args }) => {
      if (args.includes('rev-parse') && args.includes('--show-toplevel')) {
        return { stderr: '', stdout: '/root\n' } // incomplete output
      }
      throw new Error('git fail')
    }
    const resolver = new GitCliAgentMetadataResolver({ runner })
    await expect(resolver.resolve('/workspace/repo')).resolves.toBeNull()
  })

  it('evicts oldest cache entries when MAX_CACHE_ENTRIES is exceeded', async () => {
    const runner = new FakeCommandRunner()
    runner.handler = async ({ args }) => ({
      stderr: '',
      stdout: args.includes('symbolic-ref')
        ? 'main\n'
        : '/workspace/repo\n/workspace/repo/.git\n/workspace/repo/.git\n',
    })
    const resolver = new GitCliAgentMetadataResolver({ runner })
    for (let i = 0; i < 130; i++) {
      await resolver.resolve(`/workspace/repo${i}`)
    }
    expect(runner.calls.length).toBeGreaterThan(200)
  })
})
