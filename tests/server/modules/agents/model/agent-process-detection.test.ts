import { describe, expect, it } from 'vitest'
import {
  detectAgentKind,
  detectAgentProcess,
  tmuxAgentDisplayName,
} from '../../../../../server/modules/agents/model/agent-process-detection'

describe('agent process detection', () => {
  it('finds Codex behind a Node launcher in the pane foreground process group', () => {
    const snapshot = [
      '100 1 100 200 bash',
      '200 100 200 200 node /opt/node/bin/codex --profile lead',
      '201 200 200 200 /opt/openai/codex --profile lead',
    ].join('\n')

    expect(detectAgentProcess(100, snapshot)).toEqual({ kind: 'codex', pid: 200 })
  })

  it('walks foreground ancestry when an agent temporarily foregrounds a tool', () => {
    const snapshot = [
      '100 1 100 300 bash',
      '200 100 200 200 python -m hermes_cli.main',
      '300 200 300 300 bash -lc pnpm test',
    ].join('\n')

    expect(detectAgentProcess(100, snapshot)).toEqual({ kind: 'hermes', pid: 200 })
  })

  it('does not turn an ordinary foreground command into an agent', () => {
    const snapshot = [
      '100 1 100 200 bash',
      '200 100 200 200 node server.js',
    ].join('\n')

    expect(detectAgentProcess(100, snapshot)).toBeNull()
  })

  it.each([
    ['/usr/bin/claude --resume abc', 'claude'],
    ['node /opt/opencode/bin/opencode', 'opencode'],
    ['python -m hermes_cli.main', 'hermes'],
    ['/usr/local/bin/gemini --yolo', 'gemini'],
    ['/usr/local/bin/cursor-agent', 'cursor'],
  ] as const)('recognizes %s as %s', (argv, kind) => {
    expect(detectAgentKind(argv)).toBe(kind)
  })

  it('provides stable product labels', () => {
    expect(tmuxAgentDisplayName('opencode')).toBe('OpenCode')
    expect(tmuxAgentDisplayName('codex')).toBe('Codex')
  })
})
