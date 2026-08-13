import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
const suffix = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const sessionName = `gitgraph_${suffix}`

async function git(...args: string[]): Promise<string> {
  return (await execFileAsync('git', ['-C', workspace!, ...args], { encoding: 'utf8' })).stdout
}

async function commit(message: string): Promise<string> {
  await git('add', '--all')
  await git('commit', '-m', message)
  return (await git('rev-parse', 'HEAD')).trim()
}

test('opens a resizable Git graph and sends a selected file diff to Explorer', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'Git Graph E2E')
  await git('config', 'user.email', 'git-graph@example.test')
  await writeFile(join(workspace, 'example.ts'), 'export const value = 1\n')
  await commit('Add example')
  await writeFile(join(workspace, 'example.ts'), 'export const value = 2\nexport const ready = true\n')
  const selectedHash = await commit('Expand example')
  await git('checkout', '-b', 'feature/graph-e2e')
  await writeFile(join(workspace, 'feature.ts'), 'export const graph = true\n')
  await commit('Add graph branch')
  await git('checkout', 'main')
  await writeFile(join(workspace, 'main.ts'), 'export const main = true\n')
  await commit('Update main branch')
  await git('merge', '--no-ff', 'feature/graph-e2e', '-m', 'Merge graph branch')
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await page.reload()
    await page.getByRole('button', { exact: true, name: sessionName }).click()
    await page.getByRole('button', { name: 'Git Graph' }).click()

    const drawer = page.locator('.bitveins-git-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('main', { exact: false }).first()).toBeVisible()
    await expect(drawer.locator('[data-git-commit]')).toHaveCount(5)
    const graphPaths = drawer.locator('svg[aria-label^="Commit graph lane"] path')
    const pathData = await graphPaths.evaluateAll(paths => paths.map(path => path.getAttribute('d') || ''))
    expect(pathData.some(path => path.includes(' L '))).toBe(true)
    expect(pathData.every(path => !path.includes(' C '))).toBe(true)

    const initialWidth = await drawer.evaluate(element => Math.round(element.getBoundingClientRect().width))
    await drawer.getByRole('separator', { name: 'Resize Git graph' }).press('ArrowRight')
    await expect.poll(() => drawer.evaluate(element => Math.round(element.getBoundingClientRect().width)))
      .toBe(initialWidth - 24)

    await drawer.locator(`[data-git-commit="${selectedHash}"]`).click()
    const details = drawer.locator('[data-git-commit-details]')
    await expect(details).toBeVisible()
    await expect(details).toContainText('Expand example')
    await expect(details.locator('[data-git-file="example.ts"]')).toContainText('+2')
    const continuation = drawer.locator('svg[aria-hidden="true"]')
    await expect(continuation).toBeVisible()
    expect(await continuation.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(100)

    await details.locator('[data-git-file="example.ts"]').click()
    await expect(drawer).toBeHidden()
    const diff = page.locator('[data-explorer-git-diff]')
    await expect(diff).toBeVisible()
    await expect(diff).toContainText('example.ts')
    const editors = diff.locator('.cm-content')
    await expect(editors).toHaveCount(2)
    await expect(editors.nth(0)).toContainText('export const value = 1')
    await expect(editors.nth(1)).toContainText('export const ready = true')
    await expect(diff.locator('.cm-diff-line-deleted')).toHaveCount(1)
    await expect(diff.locator('.cm-diff-line-added')).toHaveCount(2)
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
