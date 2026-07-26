import {
  access,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import { FilesystemReleaseStore } from '../../../cli/platform/filesystem-release-store'
import { createReleaseFixture } from '../support/release-fixture'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function releaseStoreFixture() {
  const home = await mkdtemp(join(tmpdir(), 'bitveins-release-store-'))
  temporaryDirectories.push(home)
  const layout = resolveInstallationLayout({ HOME: home })
  return {
    layout,
    store: new FilesystemReleaseStore(layout),
  }
}

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
}

describe('FilesystemReleaseStore activation history', () => {
  it('keeps the explicit current and previous activation, irrespective of mtimes', async () => {
    const { layout, store } = await releaseStoreFixture()
    const first = await createReleaseFixture(layout, { version: '0.1.0' })
    const second = await createReleaseFixture(layout, { version: '0.2.0' })
    const unrelated = await createReleaseFixture(layout, { version: '9.9.9' })

    await store.activate(first)
    await store.recordActivation(first, null)
    const previousTarget = await readlink(layout.currentReleaseLink)
    await store.activate(second)
    await store.recordActivation(second, previousTarget)
    await store.prune()

    await expect(access(first)).resolves.toBeUndefined()
    await expect(access(second)).resolves.toBeUndefined()
    await expectMissing(unrelated)
    expect(JSON.parse(await readFile(
      join(layout.installationRoot, 'activation-history.json'),
      'utf8',
    ))).toEqual({
      current: '0.2.0',
      previous: '0.1.0',
      version: 1,
    })
  })

  it('advances previous on downgrade and preserves it on identical reactivation', async () => {
    const { layout, store } = await releaseStoreFixture()
    const first = await createReleaseFixture(layout, { version: '0.1.0' })
    const second = await createReleaseFixture(layout, { version: '0.2.0' })
    await store.activate(second)
    await store.recordActivation(second, null)
    const secondTarget = await readlink(layout.currentReleaseLink)

    await store.activate(first)
    await store.recordActivation(first, secondTarget)
    const identicalTarget = await readlink(layout.currentReleaseLink)
    await store.activate(first)
    await store.recordActivation(first, identicalTarget)

    expect(JSON.parse(await readFile(
      join(layout.installationRoot, 'activation-history.json'),
      'utf8',
    ))).toEqual({
      current: '0.1.0',
      previous: '0.2.0',
      version: 1,
    })
  })

  it('restores links and activation history from a snapshot', async () => {
    const { layout, store } = await releaseStoreFixture()
    const first = await createReleaseFixture(layout, { version: '0.1.0' })
    const second = await createReleaseFixture(layout, { version: '0.2.0' })
    await store.activate(first)
    await store.recordActivation(first, null)
    const snapshot = await store.snapshot()

    await store.activate(second)
    await store.recordActivation(second, snapshot.currentTarget)
    await store.restore(snapshot)

    expect(await readlink(layout.currentReleaseLink)).toBe(first)
    expect((await store.snapshot()).history).toEqual({
      current: '0.1.0',
      previous: null,
      version: 1,
    })
  })

  it('refuses to prune when history disagrees with the active symlink', async () => {
    const { layout, store } = await releaseStoreFixture()
    const current = await createReleaseFixture(layout, { version: '0.1.0' })
    const stale = await createReleaseFixture(layout, { version: '0.2.0' })
    const unrelated = await createReleaseFixture(layout, { version: '9.9.9' })
    await store.activate(current)
    await store.recordActivation(current, null)
    await writeFile(
      join(layout.installationRoot, 'activation-history.json'),
      JSON.stringify({
        current: '0.2.0',
        previous: null,
        version: 1,
      }),
    )

    await expect(store.prune()).rejects.toThrow(
      /history does not match the current release link/,
    )
    await expect(access(current)).resolves.toBeUndefined()
    await expect(access(stale)).resolves.toBeUndefined()
    await expect(access(unrelated)).resolves.toBeUndefined()
  })
})
