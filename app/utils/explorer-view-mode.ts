export type ExplorerViewMode = 'terminal' | 'explorer'

export function parseStoredExplorerViewMode(value: string | null): ExplorerViewMode {
  if (value === 'explorer' || value === 'ide') {
    return 'explorer'
  }

  return 'terminal'
}
