import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE
const tmuxSocketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME

if (!runId || !workspace || !tmuxSocketName) throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
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
  const stableLines = Array.from({ length: 80 }, (_, index) => `export const stable${index} = ${index}`).join('\n')
  await rm(workspace, { force: true, recursive: true })
  await mkdir(workspace, { recursive: true })
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'Git Graph E2E')
  await git('config', 'user.email', 'git-graph@example.test')
  await writeFile(join(workspace, 'example.ts'), `export const value = 1\n${stableLines}\n`)
  await commit('Add example')
  await writeFile(join(workspace, 'example.ts'), `export const value = 2\nexport const ready = true\nexport const inserted = true\n${stableLines}\n`)
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
      data: { name: sessionName, path: dirname(workspace) },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await execFileAsync('tmux', ['-L', tmuxSocketName, 'send-keys', '-l', '-t', `${sessionName}:0`, `cd -- '${workspace}'`])
    await execFileAsync('tmux', ['-L', tmuxSocketName, 'send-keys', '-t', `${sessionName}:0`, 'Enter'])

    await expect.poll(async () => {
      const response = await page.request.get(`/api/sessions/${sessionName}/windows`)
      const body = await response.json() as { windows: Array<{ path: string }> }
      return body.windows[0]?.path
    }).toBe(workspace)

    await page.reload()
    await page.getByRole('button', { exact: true, name: sessionName }).click()
    const terminalHost = page.locator('[data-terminal-host]').first()
    await expect(terminalHost).toBeVisible()
    await page.getByRole('button', { name: 'Git Graph' }).click()

    const drawer = page.locator('.bitveins-git-drawer')
    await expect(drawer).toBeVisible()
    await expect.poll(() => terminalHost.evaluate(element => getComputedStyle(element.parentElement!).opacity)).toBe('1')
    await expect(drawer.getByText('main', { exact: false }).first()).toBeVisible()
    await expect(drawer.locator('[data-git-commit]')).toHaveCount(5)
    const graphCanvas = drawer.locator('svg[aria-label="Commit graph"]')
    await expect(graphCanvas).toHaveCount(1)
    await expect(graphCanvas.locator('circle')).toHaveCount(5)
    await expect(drawer.locator('svg[aria-label^="Commit graph lane"]')).toHaveCount(0)
    const pathData = await graphCanvas.locator('path[data-segment-kind]').evaluateAll(paths => paths
      .map(path => path.getAttribute('d') || '')
      .filter(path => path.includes(' C ')))
    expect(pathData.length).toBeGreaterThan(0)
    expect(pathData.every((path) => {
      const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []
      return values.length >= 8 && values[0] === values[2] && values[4] === values[6]
    })).toBe(true)
    const initialGraphHeight = await graphCanvas.evaluate(element => element.getBoundingClientRect().height)

    const initialWidth = await drawer.evaluate(element => Math.round(element.getBoundingClientRect().width))
    await drawer.getByRole('separator', { name: 'Resize Git graph' }).press('ArrowRight')
    await expect.poll(() => drawer.evaluate(element => Math.round(element.getBoundingClientRect().width)))
      .toBe(initialWidth - 24)

    await drawer.locator(`[data-git-commit="${selectedHash}"]`).click()
    const details = drawer.locator('[data-git-commit-details]')
    await expect(details).toBeVisible()
    await expect(details).toContainText('Expand example')
    await expect(details.locator('[data-git-file="example.ts"]')).toContainText('+3')
    await expect.poll(() => graphCanvas.evaluate(element => element.getBoundingClientRect().height))
      .toBeGreaterThan(initialGraphHeight + 100)

    await details.locator('[data-git-file="example.ts"]').click()
    await expect(drawer).toBeHidden()
    const diff = page.locator('[data-explorer-git-diff]')
    await expect(diff).toBeVisible()
    await expect(diff).toContainText('example.ts')
    const mergeView = diff.locator('.cm-mergeView')
    await expect(mergeView).toBeVisible()
    const editors = mergeView.locator('.cm-content')
    await expect(editors).toHaveCount(2)
    await expect(editors.nth(0)).toContainText('export const value = 1')
    await expect(editors.nth(1)).toContainText('export const ready = true')
    await expect(diff.locator('.cm-merge-a .cm-changedLine').first()).toBeVisible()
    await expect(diff.locator('.cm-merge-b .cm-changedLine').first()).toBeVisible()
    await expect(diff.locator('.cm-merge-a .cm-mergeSpacer').first()).toBeAttached()

    const stableLineTops = await mergeView.evaluate((element) => {
      const top = (side: string) => [...element.querySelectorAll(`${side} .cm-line`)]
        .find(line => line.textContent === 'export const stable0 = 0')!
        .getBoundingClientRect().top
      return [top('.cm-merge-a'), top('.cm-merge-b')]
    })
    expect(Math.abs(stableLineTops[0]! - stableLineTops[1]!)).toBeLessThan(1)

    const scrollState = await mergeView.evaluate((element) => {
      element.scrollTop = 300
      return {
        outer: element.scrollTop,
        sides: [...element.querySelectorAll('.cm-scroller')].map(side => side.scrollTop),
      }
    })
    expect(scrollState.outer).toBeGreaterThan(0)
    expect(scrollState.sides).toEqual([0, 0])
    const scrollbarStyle = await mergeView.evaluate(element => ({
      display: getComputedStyle(element, '::-webkit-scrollbar').display,
      gutter: getComputedStyle(element).scrollbarGutter,
      width: getComputedStyle(element, '::-webkit-scrollbar').width,
    }))
    expect(scrollbarStyle).toEqual({ display: 'block', gutter: 'stable', width: '10px' })
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
