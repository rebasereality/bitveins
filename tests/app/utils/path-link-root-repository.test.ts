import { describe, expect, it } from 'vitest'
import {
  PathLinkRootRepository,
  pathLinkRootScope,
  type RootPreferenceStorage,
} from '~/utils/path-link-root-repository'

function createStorage(): RootPreferenceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    removeItem: key => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

describe('PathLinkRootRepository', () => {
  it('stores roots by session and stable tmux window id', () => {
    const repository = new PathLinkRootRepository(createStorage())
    const scope = pathLinkRootScope('demo', '@7')

    expect(repository.set(scope, './bitveins')).toBe(true)
    expect(repository.get(scope)).toBe('bitveins')
    expect(repository.hasAny()).toBe(true)
  })

  it('can forget one preference or every preference', () => {
    const repository = new PathLinkRootRepository(createStorage())
    repository.set('one', 'project-one')
    repository.set('two', 'project-two')

    repository.forget('one')
    expect(repository.get('one')).toBeNull()
    expect(repository.get('two')).toBe('project-two')

    repository.forgetAll()
    expect(repository.hasAny()).toBe(false)
  })

  it('rejects roots that escape the session workspace', () => {
    const repository = new PathLinkRootRepository(createStorage())
    expect(repository.set('scope', '../../outside')).toBe(false)
    expect(repository.set('scope', 'nested/..')).toBe(false)
    expect(repository.get('scope')).toBeNull()
  })

  it('recovers from malformed and partially invalid browser state', () => {
    const storage = createStorage()
    const repository = new PathLinkRootRepository(storage)
    storage.values.set('bitveins.pathLinkRoots', '{broken')
    expect(repository.get('scope')).toBeNull()

    storage.values.set('bitveins.pathLinkRoots', JSON.stringify({
      version: 1,
      roots: {
        safe: 'project',
        unsafe: '../outside',
        invalid: 42,
      },
    }))
    expect(repository.get('safe')).toBe('project')
    expect(repository.get('unsafe')).toBeNull()

    storage.values.set('bitveins.pathLinkRoots', JSON.stringify({ version: 2, roots: {} }))
    expect(repository.hasAny()).toBe(false)
  })
})
