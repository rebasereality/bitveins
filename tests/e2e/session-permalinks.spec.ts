import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE
if (!runId || !workspace) throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')

const suffix = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const sessionName = `links_${suffix}`
const renamedName = `${sessionName}_renamed`
const fileName = 'permalink file.md'

test('keeps stable canonical session, terminal, and Explorer history without remounting the shell', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await writeFile(`${workspace}/${fileName}`, '# Permalink proof\n')
  await authenticate(page)

  try {
    const createdResponse = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(createdResponse.ok(), await createdResponse.text()).toBe(true)
    const { session } = await createdResponse.json() as { session: { id: string, name: string } }
    expect(session.id).toMatch(/^[A-Za-z0-9_-]{16}$/u)

    await page.reload()
    await page.getByRole('button', { exact: true, name: sessionName }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await expect.poll(() => new URL(page.url()).pathname)
      .toMatch(new RegExp(`^/s/${sessionName}~${session.id}/t/\\d+$`, 'u'))
    const firstTerminalPath = new URL(page.url()).pathname
    await page.locator('[data-bitveins-app]').evaluate(element => element.setAttribute('data-permalink-probe', 'preserved'))

    await page.getByRole('button', { name: 'New tmux window' }).click()
    const secondTab = page.getByRole('tab', { name: /^Tmux window 1:/u })
    await expect(secondTab).toHaveAttribute('aria-selected', 'true')
    const windowsResponse = await page.request.get(`/api/sessions/${sessionName}/windows`)
    const { windows } = await windowsResponse.json() as { windows: Array<{ id: string, index: number }> }
    const secondWindow = windows.find(window => window.index === 1)!
    const secondTerminalPath = `/s/${sessionName}~${session.id}/t/${secondWindow.id.slice(1)}`
    await expect.poll(() => new URL(page.url()).pathname).toBe(secondTerminalPath)

    await page.getByRole('button', { name: 'Files' }).click()
    const explorerRootPath = `/s/${sessionName}~${session.id}/e`
    await expect.poll(() => new URL(page.url()).pathname).toBe(explorerRootPath)
    await page.getByText(fileName, { exact: true }).dblclick()
    const explorerFilePath = `${explorerRootPath}/permalink%20file.md`
    await expect.poll(() => new URL(page.url()).pathname).toBe(explorerFilePath)
    await expect(page.locator('[data-explorer-tab]', { hasText: fileName })).toBeVisible()
    await expect(page.locator('[data-bitveins-app]')).toHaveAttribute('data-permalink-probe', 'preserved')

    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe(explorerRootPath)
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe(secondTerminalPath)
    await expect(secondTab).toHaveAttribute('aria-selected', 'true')
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe(firstTerminalPath)

    await page.goForward()
    await page.goForward()
    await page.goForward()
    await expect.poll(() => new URL(page.url()).pathname).toBe(explorerFilePath)
    await page.reload()
    await expect(page.locator('[data-explorer-tab]', { hasText: fileName })).toBeVisible()

    const historyLengthBeforeRename = await page.evaluate(() => window.history.length)
    await page.getByRole('button', { name: `Actions for ${sessionName}` }).click()
    await page.getByRole('menuitem', { name: 'Rename session' }).click()
    await page.getByRole('dialog', { name: 'Rename tmux session' }).getByLabel('Session name').fill(renamedName)
    await page.getByRole('dialog', { name: 'Rename tmux session' }).getByRole('button', { name: 'Rename' }).click()
    await expect.poll(() => new URL(page.url()).pathname)
      .toBe(`/s/${renamedName}~${session.id}/e/permalink%20file.md`)
    expect(await page.evaluate(() => window.history.length)).toBe(historyLengthBeforeRename)

    await page.goto(explorerFilePath)
    await expect.poll(() => new URL(page.url()).pathname)
      .toBe(`/s/${renamedName}~${session.id}/e/permalink%20file.md`)

    await page.goto(`/s/${renamedName}`)
    await expect.poll(() => new URL(page.url()).pathname)
      .toMatch(new RegExp(`^/s/${renamedName}~${session.id}/t/\\d+$`, 'u'))
    await page.goto(`/?session=${renamedName}&window=${encodeURIComponent(secondWindow.id)}`)
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/s/${renamedName}~${session.id}/t/${secondWindow.id.slice(1)}`)

    await page.goto('/')
    await page.goto(`/s/${renamedName}~${session.id}/t/9999999999`)
    await expect(page.getByText('The linked tmux window is no longer available.').first()).toBeVisible()
    await expect(page.locator('[data-session-active="true"]')).toHaveCount(0)

    await page.goto(`/s/${renamedName}~${session.id}/e/missing-file.txt`)
    await expect(page.getByText('The linked Explorer file is no longer available.').first()).toBeVisible()
    await expect(page.locator('[data-session-active="true"]')).toHaveCount(0)
  }
  finally {
    await page.request.delete(`/api/sessions/${renamedName}`).catch(() => undefined)
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
