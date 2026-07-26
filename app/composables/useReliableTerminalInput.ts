import { ref } from 'vue'
import {
  isTerminalInputWithinLimit,
  MAX_INPUT_BYTES,
  type ClientMessage,
} from '#shared/contracts/terminal'
import {
  acknowledgeReliableInput,
  discardReliableInputSubmission,
  enqueueReliableInputs,
  type ReliableInputEntry,
  recordReliableInputAttempt,
  reliableInputSubmissionCount,
  reliableInputsForWindow,
} from '~/utils/reliable-input-outbox'

interface ReliableInputAttachment {
  sessionName: string
  windowIndex: number
}

interface ReliableTerminalInputOptions {
  attachment: () => ReliableInputAttachment | null
  onAbandon: (data: readonly string[]) => void
  onStatus: (status: string) => void
  onTimeout: () => void
  post: (message: Extract<ClientMessage, { action: 'reliableInput' }>) => boolean
  storage?: () => Storage | null
}

export const RELIABLE_INPUT_ACK_TIMEOUT_MS = 8_000
export const RELIABLE_INPUT_MAX_ATTEMPTS = 3

const INPUT_LIMIT_LABEL = `${MAX_INPUT_BYTES / 1024} KiB`

export function useReliableTerminalInput(options: ReliableTerminalInputOptions) {
  const pendingCount = ref(0)
  const volatileAttempts = new Map<string, number>()
  let sentId: string | null = null
  let ackTimer: number | null = null

  function storage(): Storage | null {
    if (options.storage) {
      return options.storage()
    }
    return import.meta.client ? window.sessionStorage : null
  }

  function entries() {
    const currentStorage = storage()
    const attachment = options.attachment()

    if (!currentStorage || !attachment) {
      return []
    }

    try {
      return reliableInputsForWindow(currentStorage, attachment.sessionName, attachment.windowIndex)
    }
    catch {
      return []
    }
  }

  function refresh(): void {
    pendingCount.value = reliableInputSubmissionCount(entries())
  }

  function clearTimer(): void {
    if (ackTimer !== null) {
      window.clearTimeout(ackTimer)
      ackTimer = null
    }
  }

  function startTimer(): void {
    if (ackTimer || !sentId) {
      return
    }

    ackTimer = window.setTimeout(() => {
      ackTimer = null
      handleTimeout()
    }, RELIABLE_INPUT_ACK_TIMEOUT_MS)
  }

  function currentAttempts(entry: ReliableInputEntry): number {
    return Math.max(entry.attempts, volatileAttempts.get(entry.id) ?? 0)
  }

  function rejectSubmission(data: readonly string[], status: string): void {
    try {
      options.onAbandon(data)
    }
    catch {
      options.onStatus('Async command could not be saved to local recovery storage')
    }
    options.onStatus(status)
  }

  function abandonSubmission(entry: ReliableInputEntry, status: string): void {
    const currentStorage = storage()
    if (!currentStorage) {
      rejectSubmission([entry.data], status)
      return
    }

    const discarded = discardReliableInputSubmission(currentStorage, entry.submissionId)
    for (const discardedEntry of discarded) {
      volatileAttempts.delete(discardedEntry.id)
      if (sentId === discardedEntry.id) {
        sentId = null
        clearTimer()
      }
    }
    refresh()
    rejectSubmission(discarded.map(discardedEntry => discardedEntry.data), status)
  }

  function enqueueAll(data: readonly string[]): boolean {
    if (data.length === 0) {
      return true
    }

    if (data.some(entryData => !isTerminalInputWithinLimit(entryData))) {
      rejectSubmission(
        data,
        `Async command exceeds ${INPUT_LIMIT_LABEL}; it was kept in history and skipped`,
      )
      return false
    }

    const currentStorage = storage()
    const attachment = options.attachment()

    if (!currentStorage || !attachment) {
      rejectSubmission(data, 'Async command could not be queued; it remains available to restore')
      return false
    }

    try {
      const createdAt = Date.now()
      const submissionId = crypto.randomUUID()
      const accepted = enqueueReliableInputs(
        currentStorage,
        data.map(entryData => ({
          attempts: 0,
          createdAt,
          data: entryData,
          id: crypto.randomUUID(),
          sessionName: attachment.sessionName,
          submissionId,
          windowIndex: attachment.windowIndex,
        })),
      )

      refresh()

      if (!accepted) {
        rejectSubmission(data, 'Async delivery queue is full; the command remains available to restore')
      }

      return accepted
    }
    catch {
      rejectSubmission(data, 'Unable to persist async delivery queue; the command remains available to restore')
      return false
    }
  }

  function flush(): void {
    if (sentId) {
      startTimer()
      return
    }

    const entry = entries()[0]
    if (!entry) {
      return
    }

    if (!isTerminalInputWithinLimit(entry.data)) {
      abandonSubmission(
        entry,
        `Async command exceeds ${INPUT_LIMIT_LABEL}; it was kept in history and skipped`,
      )
      flush()
      return
    }

    if (currentAttempts(entry) >= RELIABLE_INPUT_MAX_ATTEMPTS) {
      abandonSubmission(
        entry,
        `Async command was skipped after ${RELIABLE_INPUT_MAX_ATTEMPTS} failed delivery attempts; it remains in history`,
      )
      flush()
      return
    }

    if (!options.post({
      action: 'reliableInput',
      payload: { id: entry.id, data: entry.data },
    })) {
      return
    }

    sentId = entry.id
    const attempt = currentAttempts(entry) + 1
    volatileAttempts.set(entry.id, attempt)
    try {
      recordReliableInputAttempt(currentStorageOrThrow(), entry.id)
    }
    catch {
      options.onStatus('Async delivery retry count could not be persisted')
    }
    startTimer()
  }

  function currentStorageOrThrow(): Storage {
    const currentStorage = storage()
    if (!currentStorage) {
      throw new Error('Reliable input storage is unavailable.')
    }
    return currentStorage
  }

  function handleTimeout(): void {
    const entry = entries().find(candidate => candidate.id === sentId)
    if (
      entry
      && currentAttempts(entry) >= RELIABLE_INPUT_MAX_ATTEMPTS
    ) {
      abandonSubmission(
        entry,
        `Async command was skipped after ${RELIABLE_INPUT_MAX_ATTEMPTS} failed delivery attempts; it remains in history`,
      )
    }
    options.onTimeout()
  }

  return {
    acknowledge(inputId: string): void {
      const currentStorage = storage()

      if (currentStorage) {
        try {
          acknowledgeReliableInput(currentStorage, inputId)
        }
        catch {
          options.onStatus('Delivered, but local acknowledgement could not be saved')
        }
      }

      volatileAttempts.delete(inputId)
      if (sentId === inputId) {
        sentId = null
        clearTimer()
      }
      refresh()
      flush()
    },
    enqueue(data: string): boolean {
      return enqueueAll([data])
    },
    enqueueAll,
    flush,
    pendingCount,
    refresh,
    resetConnection(): void {
      sentId = null
      clearTimer()
    },
  }
}
