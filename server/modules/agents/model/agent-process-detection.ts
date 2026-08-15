import type { TmuxAgentKind } from '#shared/contracts/agents'

interface ProcessRecord {
  argv: string
  foregroundProcessGroupId: number
  parentPid: number
  pid: number
  processGroupId: number
}

export interface DetectedAgentProcess {
  kind: TmuxAgentKind
  pid: number
}

const AGENT_PATTERNS: ReadonlyArray<{
  kind: TmuxAgentKind
  patterns: RegExp[]
}> = [
  {
    kind: 'antigravity',
    patterns: [
      /(?:^|[\s/])agy(?:[\s]|$)/iu,
      /(?:^|[\s/])antigravity(?:[\s]|$)/iu,
      /(?:^|[\s/])antigravity-cli(?:[\s]|$)/iu,
      /(?:^|[\s/])\.gemini[/\\]antigravity(?:-cli)?[/\\]/iu,
    ],
  },
  { kind: 'hermes', patterns: [/(?:^|[\s/])hermes(?:[\s]|$)/iu, /hermes_cli\.main/iu] },
  { kind: 'claude', patterns: [/(?:^|[\s/])claude(?:[\s]|$)/iu, /claude-code/iu] },
  { kind: 'opencode', patterns: [/(?:^|[\s/])opencode(?:[\s]|$)/iu] },
  { kind: 'gemini', patterns: [/(?:^|[\s/])gemini(?:[\s]|$)/iu, /gemini-cli/iu] },
  {
    kind: 'grok',
    patterns: [
      /(?:^|[\s/])grok(?:[\s]|$)/iu,
      /(?:^|[\s/])grok-(?:linux|darwin|windows)/iu,
      /(?:^|[\s/])\.grok[/\\](?:bin[/\\])?(?:agent|grok)(?:[\s]|$)/iu,
    ],
  },
  { kind: 'cursor', patterns: [/(?:^|[\s/])cursor-agent(?:[\s]|$)/iu] },
  { kind: 'copilot', patterns: [/(?:^|[\s/])copilot(?:[\s]|$)/iu, /github-copilot-cli/iu] },
  { kind: 'aider', patterns: [/(?:^|[\s/])aider(?:[\s]|$)/iu] },
  { kind: 'codex', patterns: [/(?:^|[\s/])codex(?:-[\w-]+)?(?:[\s]|$)/iu, /@openai[/\\]codex/iu] },
  { kind: 'pi', patterns: [/(?:^|[\s/])pi(?:[\s]|$)/u] },
]

function parseProcessSnapshot(stdout: string): Map<number, ProcessRecord> {
  const processes = new Map<number, ProcessRecord>()
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(.*?)\s*$/u.exec(line)
    if (!match) continue
    const [pid, parentPid, processGroupId, foregroundProcessGroupId] = match.slice(1, 5).map(Number)
    if (![pid, parentPid, processGroupId, foregroundProcessGroupId].every(Number.isSafeInteger)) continue
    processes.set(pid!, {
      argv: match[5] ?? '',
      foregroundProcessGroupId: foregroundProcessGroupId!,
      parentPid: parentPid!,
      pid: pid!,
      processGroupId: processGroupId!,
    })
  }
  return processes
}

export function detectAgentKind(argv: string): TmuxAgentKind | null {
  for (const descriptor of AGENT_PATTERNS) {
    if (descriptor.patterns.some(pattern => pattern.test(argv))) return descriptor.kind
  }
  return null
}

export function detectAgentProcess(panePid: number, processSnapshot: string): DetectedAgentProcess | null {
  const processes = parseProcessSnapshot(processSnapshot)
  const paneProcess = processes.get(panePid)
  if (!paneProcess) return null

  const candidates = new Map<number, ProcessRecord>()
  candidates.set(paneProcess.pid, paneProcess)
  if (paneProcess.foregroundProcessGroupId > 0) {
    for (const process of processes.values()) {
      if (process.processGroupId === paneProcess.foregroundProcessGroupId) candidates.set(process.pid, process)
    }
  }

  const queue = [paneProcess.pid]
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const process of processes.values()) {
      if (process.parentPid === parentId && !candidates.has(process.pid)) {
        candidates.set(process.pid, process)
        queue.push(process.pid)
      }
    }
  }

  for (const candidate of [...candidates.values()]) {
    let current: ProcessRecord | undefined = candidate
    const visited = new Set<number>()
    while (current && !visited.has(current.pid)) {
      visited.add(current.pid)
      candidates.set(current.pid, current)
      if (current.pid === panePid) break
      current = processes.get(current.parentPid)
    }
  }

  const detected: Array<DetectedAgentProcess & { depth: number }> = []
  for (const process of candidates.values()) {
    const kind = detectAgentKind(process.argv)
    if (kind) detected.push({ depth: processDepth(process, processes, panePid), kind, pid: process.pid })
  }
  detected.sort((left, right) => right.depth - left.depth)
  const match = detected[0]
  return match ? { kind: match.kind, pid: match.pid } : null
}

function processDepth(
  process: ProcessRecord,
  processes: ReadonlyMap<number, ProcessRecord>,
  panePid: number,
): number {
  let current: ProcessRecord | undefined = process
  let depth = 0
  const visited = new Set<number>()
  while (current && current.pid !== panePid && !visited.has(current.pid)) {
    visited.add(current.pid)
    depth += 1
    current = processes.get(current.parentPid)
  }
  return depth
}

export function tmuxAgentDisplayName(kind: TmuxAgentKind): string {
  return {
    aider: 'Aider',
    antigravity: 'Antigravity',
    claude: 'Claude',
    codex: 'Codex',
    copilot: 'Copilot',
    cursor: 'Cursor',
    gemini: 'Gemini',
    grok: 'Grok',
    hermes: 'Hermes',
    opencode: 'OpenCode',
    pi: 'Pi',
  }[kind]
}
