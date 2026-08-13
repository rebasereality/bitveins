import { tmuxAgentLabelSchema } from '#shared/contracts/agents'
import { normalizeCodexThreadId } from '../model/codex-thread-id'
import type { CodexAgentMetadataResolver } from '../ports/codex-agent-metadata-resolver'
import type { CodexProcessInspector } from '../ports/codex-process-inspector'
import type { CodexThreadMetadataReader } from '../ports/codex-thread-metadata-reader'

interface CodexAgentMetadataServiceOptions {
  processes: CodexProcessInspector
  threads: CodexThreadMetadataReader
}

export class CodexAgentMetadataService implements CodexAgentMetadataResolver {
  constructor(private readonly options: CodexAgentMetadataServiceOptions) {}

  async labelFor(processId: number, hintedThreadId?: string): Promise<string | null> {
    const process = await this.options.processes.inspect(processId)
    if (!process) return null
    const threadIds = [normalizeCodexThreadId(hintedThreadId), process.threadId]
      .filter((threadId, index, values): threadId is string => (
        Boolean(threadId) && values.indexOf(threadId) === index
      ))

    for (const threadId of threadIds) {
      try {
        const metadata = await this.options.threads.read(process.executable, threadId)
        const label = normalizeLabel(metadata?.name) ?? normalizeLabel(metadata?.preview)
        if (label) return label
      }
      catch {
        // A stale hook hint or unavailable App Server should not hide the tmux fallback.
      }
    }
    return null
  }
}

export function normalizeCodexThreadLabel(value: unknown): string | null {
  return normalizeLabel(value)
}

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80)
  return tmuxAgentLabelSchema.safeParse(normalized).success ? normalized : null
}
