export const RELIABLE_INPUT_OUTBOX_KEY = 'bitveins.reliable-input-outbox.v1'
export const RELIABLE_INPUT_OUTBOX_LIMIT = 20
export const RELIABLE_INPUT_TTL_MS = 24 * 60 * 60_000

export interface ReliableInputEntry {
  attempts: number
  createdAt: number
  data: string
  id: string
  paneId?: string
  sessionName: string
  submissionId: string
  windowIndex: number
}

type StoredReliableInputEntry = Omit<ReliableInputEntry, 'attempts' | 'submissionId'> & {
  attempts?: number
  submissionId?: string
}

function isStoredReliableInputEntry(value: unknown): value is StoredReliableInputEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Partial<StoredReliableInputEntry>

  return typeof entry.createdAt === 'number'
    && Number.isFinite(entry.createdAt)
    && typeof entry.data === 'string'
    && typeof entry.id === 'string'
    && (entry.paneId === undefined || (typeof entry.paneId === 'string' && /^%\d+$/.test(entry.paneId)))
    && typeof entry.sessionName === 'string'
    && typeof entry.windowIndex === 'number'
    && Number.isInteger(entry.windowIndex)
}

function normalizeEntries(entries: readonly StoredReliableInputEntry[]): ReliableInputEntry[] {
  let legacySubmissionId: string | null = null
  let legacyCreatedAt: number | null = null
  let legacyAttachment = ''

  return entries.map((entry) => {
    const attachment = `${entry.sessionName}:${entry.windowIndex}`
    if (
      typeof entry.submissionId !== 'string'
      && (
        legacySubmissionId === null
        || legacyCreatedAt !== entry.createdAt
        || legacyAttachment !== attachment
      )
    ) {
      legacySubmissionId = `legacy:${entry.id}`
    }

    const submissionId = entry.submissionId || legacySubmissionId || `legacy:${entry.id}`
    const attempts = typeof entry.attempts === 'number'
      && Number.isInteger(entry.attempts)
      && entry.attempts >= 0
      ? entry.attempts
      : 0
    const normalized = {
      ...entry,
      attempts,
      submissionId,
    }

    legacyCreatedAt = entry.createdAt
    legacyAttachment = attachment
    if (entry.data === '\r' || entry.data === '\t') {
      legacySubmissionId = null
    }

    return normalized
  })
}

function write(storage: Storage, entries: readonly ReliableInputEntry[]): void {
  if (entries.length === 0) {
    storage.removeItem(RELIABLE_INPUT_OUTBOX_KEY)
    return
  }

  storage.setItem(RELIABLE_INPUT_OUTBOX_KEY, JSON.stringify(entries))
}

export function readReliableInputOutbox(storage: Storage, now = Date.now()): ReliableInputEntry[] {
  const raw = storage.getItem(RELIABLE_INPUT_OUTBOX_KEY)

  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return normalizeEntries(parsed.filter(isStoredReliableInputEntry))
      .filter(entry => now - entry.createdAt <= RELIABLE_INPUT_TTL_MS)
      .slice(-RELIABLE_INPUT_OUTBOX_LIMIT)
  }
  catch {
    return []
  }
}

export function enqueueReliableInput(storage: Storage, entry: ReliableInputEntry, now = Date.now()): boolean {
  return enqueueReliableInputs(storage, [entry], now)
}

export function enqueueReliableInputs(
  storage: Storage,
  candidateEntries: readonly ReliableInputEntry[],
  now = Date.now(),
): boolean {
  const currentEntries = readReliableInputOutbox(storage, now)
  const currentIds = new Set(currentEntries.map(entry => entry.id))
  const newEntries = candidateEntries.filter((entry, index) => (
    !currentIds.has(entry.id)
    && candidateEntries.findIndex(candidate => candidate.id === entry.id) === index
  ))

  if (newEntries.length === 0) {
    return true
  }

  if (currentEntries.length + newEntries.length > RELIABLE_INPUT_OUTBOX_LIMIT) {
    return false
  }

  write(storage, [...currentEntries, ...newEntries])
  return true
}

export function acknowledgeReliableInput(storage: Storage, id: string, now = Date.now()): void {
  write(storage, readReliableInputOutbox(storage, now).filter(entry => entry.id !== id))
}

export function recordReliableInputAttempt(
  storage: Storage,
  id: string,
  now = Date.now(),
): ReliableInputEntry | null {
  let attemptedEntry: ReliableInputEntry | null = null
  const entries = readReliableInputOutbox(storage, now).map((entry) => {
    if (entry.id !== id) {
      return entry
    }

    attemptedEntry = {
      ...entry,
      attempts: entry.attempts + 1,
    }
    return attemptedEntry
  })
  write(storage, entries)
  return attemptedEntry
}

export function discardReliableInputSubmission(
  storage: Storage,
  submissionId: string,
  now = Date.now(),
): ReliableInputEntry[] {
  const entries = readReliableInputOutbox(storage, now)
  const discarded = entries.filter(entry => entry.submissionId === submissionId)
  write(storage, entries.filter(entry => entry.submissionId !== submissionId))
  return discarded
}

export function reliableInputSubmissionCount(entries: readonly ReliableInputEntry[]): number {
  return new Set(entries.map(entry => entry.submissionId)).size
}

export function reliableInputsForWindow(
  storage: Storage,
  sessionName: string,
  windowIndex: number,
  now = Date.now(),
  paneId?: string,
  includeLegacy = false,
): ReliableInputEntry[] {
  return readReliableInputOutbox(storage, now).filter(entry => (
    entry.sessionName === sessionName
    && entry.windowIndex === windowIndex
    && (paneId === undefined || entry.paneId === paneId || (includeLegacy && entry.paneId === undefined))
  ))
}
