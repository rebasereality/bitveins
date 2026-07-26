export const liveControlOrderStorageKey = 'bitveins.liveControls.order.v1'
export const liveControlDragClickGuardMs = 350

export function reconcileLiveControlOrder(savedIds: unknown, defaultIds: readonly string[]): string[] {
  if (!Array.isArray(savedIds)) {
    return [...defaultIds]
  }

  const defaultSet = new Set(defaultIds)
  const seen = new Set<string>()
  const orderedSavedIds = savedIds.filter((id): id is string => {
    if (typeof id !== 'string' || !defaultSet.has(id) || seen.has(id)) {
      return false
    }

    seen.add(id)
    return true
  })

  return [
    ...orderedSavedIds,
    ...defaultIds.filter(id => !seen.has(id)),
  ]
}

export function readLiveControlOrder(storage: Storage, defaultIds: readonly string[]): string[] {
  const stored = storage.getItem(liveControlOrderStorageKey)

  if (!stored) {
    return [...defaultIds]
  }

  try {
    return reconcileLiveControlOrder(JSON.parse(stored), defaultIds)
  }
  catch {
    return [...defaultIds]
  }
}

export function saveLiveControlOrder(storage: Storage, orderedIds: readonly string[]): void {
  storage.setItem(liveControlOrderStorageKey, JSON.stringify(orderedIds))
}

export function shouldBlockLiveControlActivation(options: {
  dragging: boolean
  lastDragEndedAt: number
  now: number
}): boolean {
  return options.dragging || options.now - options.lastDragEndedAt < liveControlDragClickGuardMs
}

export const shouldBlockLiveControlSend = shouldBlockLiveControlActivation
