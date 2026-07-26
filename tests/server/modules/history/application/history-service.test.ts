import { describe, expect, it } from 'vitest'
import { HistoryService } from '../../../../../server/modules/history/application/history-service'
import type { HistoryScope } from '../../../../../server/modules/history/model/history-scope'
import type { HistoryRepository } from '../../../../../server/modules/history/ports/history-repository'
import type { HistoryMessage } from '../../../../../shared/contracts/terminal'

class MemoryHistoryRepository implements HistoryRepository {
  readonly messages: Array<HistoryMessage & HistoryScope> = []

  list(scope: HistoryScope): HistoryMessage[] {
    return this.messages
      .filter(message => (
        message.sessionName === scope.sessionName
        && message.windowId === scope.windowId
        && message.windowIndex === scope.windowIndex
      ))
      .toReversed()
      .map(({ createdAt, id, message }) => ({ createdAt, id, message }))
  }

  save(scope: HistoryScope, message: string, createdAt: number): HistoryMessage {
    const saved = {
      createdAt,
      id: this.messages.length + 1,
      message,
    }
    this.messages.push({ ...scope, ...saved })
    return saved
  }
}

const mainWindow = {
  sessionName: 'main',
  windowId: '@1',
  windowIndex: 0,
}

function setup() {
  const repository = new MemoryHistoryRepository()
  const service = new HistoryService({
    clock: () => 123,
    repository,
  })
  return { repository, service }
}

describe('HistoryService', () => {
  it('normalizes, stores, and lists messages through its repository', () => {
    const { repository, service } = setup()

    expect(service.saveMessage(mainWindow, 'command  \n')).toEqual({
      createdAt: 123,
      id: 1,
      message: 'command',
    })
    expect(repository.messages[0]).toMatchObject({
      ...mainWindow,
      message: 'command',
    })
    expect(service.listMessages(mainWindow)).toEqual([{
      createdAt: 123,
      id: 1,
      message: 'command',
    }])
  })

  it('rejects empty messages and invalid tmux scopes before persistence', () => {
    const { repository, service } = setup()

    expect(() => service.saveMessage(mainWindow, '   \n')).toThrow('History message is required.')
    expect(() => service.saveMessage({
      ...mainWindow,
      sessionName: '../bad',
    }, 'message')).toThrow('Session names may contain')
    expect(() => service.saveMessage({
      ...mainWindow,
      windowId: 'bad',
    }, 'message')).toThrow('A valid tmux window id is required.')
    expect(() => service.saveMessage({
      ...mainWindow,
      windowIndex: -1,
    }, 'message')).toThrow('A valid tmux window index is required.')
    expect(repository.messages).toEqual([])
  })

  it('uses the system clock by default', () => {
    const repository = new MemoryHistoryRepository()
    const service = new HistoryService({ repository })

    const saved = service.saveMessage(mainWindow, 'command')

    expect(saved.createdAt).toBeGreaterThan(0)
  })
})
