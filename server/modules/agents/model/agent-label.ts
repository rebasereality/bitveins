import { tmuxAgentLabelSchema } from '#shared/contracts/agents'

export function normalizeAgentLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80)
  return tmuxAgentLabelSchema.safeParse(normalized).success ? normalized : null
}
