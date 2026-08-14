import type { TmuxAgent } from '#shared/contracts/agents'
import type { AgentGitMetadataResolver } from '../../../agents/ports/agent-git-metadata-resolver'
import type { AntigravityAgentMetadataResolver } from '../../../agents/ports/antigravity-agent-metadata-resolver'
import type { CodexAgentMetadataResolver } from '../../../agents/ports/codex-agent-metadata-resolver'
import type { GrokAgentMetadataResolver } from '../../../agents/ports/grok-agent-metadata-resolver'
import { classifyAgentScreenStatus, stripAgentActivityGlyph } from '../../../agents/model/agent-screen-status'
import { detectAgentProcess, tmuxAgentDisplayName } from '../../../agents/model/agent-process-detection'
import { normalizeTmuxAgentTitle, parseTmuxAgentPaneCandidates } from '../../../agents/adapters/tmux-agent-output'
import type { CommandRunner } from './command-runner'

export interface TmuxAgentListerOptions {
  agentGitMetadata?: AgentGitMetadataResolver
  antigravityAgentMetadata?: AntigravityAgentMetadataResolver
  codexAgentMetadata?: CodexAgentMetadataResolver
  grokAgentMetadata?: GrokAgentMetadataResolver
  maxBuffer: number
  runner: CommandRunner
  timeoutMs: number
}

export async function listDiscoveredTmuxAgents(
  options: TmuxAgentListerOptions,
  runTmux: (args: readonly string[]) => Promise<string>,
): Promise<TmuxAgent[]> {
  const candidates = parseTmuxAgentPaneCandidates(await runTmux([
    'list-panes', '-a', '-F',
    '#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_pid}\t#{pane_dead}\t#{@bitveins_agent_label}\t#{@bitveins_codex_thread_id}\t#{pane_current_path}',
  ]))

  if (candidates.length === 0) return []

  let processSnapshot = ''
  try {
    processSnapshot = (await options.runner.run(
      'ps',
      ['-eo', 'pid=,ppid=,pgid=,tpgid=,args='],
      { maxBuffer: options.maxBuffer, timeoutMs: options.timeoutMs },
    )).stdout
  }
  catch {
    return []
  }

  const detected = candidates.flatMap((candidate) => {
    const process = detectAgentProcess(candidate.panePid, processSnapshot)
    return process ? [{ candidate, process }] : []
  })

  const agents = await Promise.all(detected.map(async ({ candidate, process }) => {
    const [rawTitle, screen, git] = await Promise.all([
      runTmux(['display-message', '-p', '-t', candidate.paneId, '#{pane_title}']).catch(() => ''),
      runTmux(['capture-pane', '-e', '-p', '-J', '-t', candidate.paneId]).catch(() => null),
      options.agentGitMetadata?.resolve(candidate.path) ?? null,
    ])
    const title = stripAgentActivityGlyph(normalizeTmuxAgentTitle(rawTitle) ?? '')
    const codexLabel = process.kind === 'codex'
      ? await options.codexAgentMetadata?.labelFor(process.pid, candidate.codexThreadId)
      : null
    const antigravityLabel = process.kind === 'antigravity'
      ? await options.antigravityAgentMetadata?.labelFor(process.pid)
      : null
    const grokLabel = process.kind === 'grok'
      ? await options.grokAgentMetadata?.labelFor(process.pid, candidate.path)
      : null
    const dynamicAgentLabel = codexLabel || antigravityLabel || grokLabel
    const defaultLabel = dynamicAgentLabel || title || candidate.windowName || tmuxAgentDisplayName(process.kind)
    const label = candidate.customLabel ?? defaultLabel
    return {
      ...(candidate.customLabel ? { customLabel: candidate.customLabel } : {}),
      defaultLabel,
      ...(git ? { git } : {}),
      id: candidate.paneId,
      kind: process.kind,
      label,
      paneId: candidate.paneId,
      paneIndex: candidate.paneIndex,
      path: candidate.path,
      sessionName: candidate.sessionName,
      status: classifyAgentScreenStatus(process.kind, rawTitle, screen),
      windowId: candidate.windowId,
      windowIndex: candidate.windowIndex,
      windowName: candidate.windowName,
    } satisfies TmuxAgent
  }))

  return agents.sort((left, right) => (
    left.sessionName.localeCompare(right.sessionName)
    || left.windowIndex - right.windowIndex
    || left.paneIndex - right.paneIndex
  ))
}
