import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DrizzlePromptDraftRepository } from '../../../../../server/modules/sessions/adapters/drizzle-prompt-draft-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

describe('DrizzlePromptDraftRepository', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bitveins-prompt-drafts-'))
    process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
  })

  afterEach(() => {
    closeDatabase()
    delete process.env.BITVEINS_DATABASE_PATH
    rmSync(tempDir, { force: true, recursive: true })
  })

  it('saves, retrieves, lists, and clears drafts per session and window', () => {
    const repository = new DrizzlePromptDraftRepository(useDrizzle())

    expect(repository.getDraft('Bitveins', '@1')).toBeNull()
    expect(repository.listDrafts('Bitveins')).toEqual({})

    const saved1 = repository.saveDraft({
      draft: 'git status',
      now: 1000,
      sessionName: 'Bitveins',
      windowId: '@1',
    })
    expect(saved1).toEqual({
      draft: 'git status',
      revision: 1,
      sessionName: 'Bitveins',
      updatedAt: 1000,
      windowId: '@1',
    })

    repository.saveDraft({
      draft: 'npm test',
      now: 2000,
      sessionName: 'Bitveins',
      windowId: '@2',
    })

    expect(repository.listDrafts('Bitveins')).toEqual({
      '@1': 'git status',
      '@2': 'npm test',
    })
    expect(repository.listDrafts('OtherSession')).toEqual({})

    // Update draft with new revision
    const updated = repository.saveDraft({
      draft: 'git status -s',
      now: 3000,
      revision: 5,
      sessionName: 'Bitveins',
      windowId: '@1',
    })
    expect(updated.draft).toBe('git status -s')
    expect(updated.revision).toBe(5)
    expect(repository.getDraft('Bitveins', '@1')?.draft).toBe('git status -s')

    // Saving empty string clears draft
    repository.saveDraft({
      draft: '',
      now: 4000,
      sessionName: 'Bitveins',
      windowId: '@1',
    })
    expect(repository.getDraft('Bitveins', '@1')).toBeNull()
    expect(repository.listDrafts('Bitveins')).toEqual({
      '@2': 'npm test',
    })

    // Explicit clear
    repository.clearDraft('Bitveins', '@2')
    expect(repository.getDraft('Bitveins', '@2')).toBeNull()
    expect(repository.listDrafts('Bitveins')).toEqual({})
  })
})
