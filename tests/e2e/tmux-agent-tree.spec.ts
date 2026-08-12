import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const execFileAsync = promisify(execFile)
const runId = process.env.BITVEINS_E2E_RUN_ID
const socketName = process.env.BITVEINS_E2E_TMUX_SOCKET_NAME
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !socketName || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const suffix = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const sessionName = `agents_${suffix}`

test('discovers, navigates, renames, and tracks a tmux agent pane', async ({ page }) => {
  await mkdir(workspace, { recursive: true })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)

    const windowCreated = await page.request.post(`/api/sessions/${sessionName}/windows`)
    expect(windowCreated.ok(), await windowCreated.text()).toBe(true)
    const { window: agentWindow } = await windowCreated.json() as {
      window: { id: string, index: number }
    }
    const agentPaneId = (await execFileAsync('tmux', [
      '-L', socketName, 'display-message', '-p', '-t', `${sessionName}:${agentWindow.index}`, '#{pane_id}',
    ])).stdout.trim()

    const command = [
      'exec -a codex bash -c \'',
      'printf "\\033[2J\\033[H\\033]0;⠦ E2E agent\\aThinking...\\nEsc to interrupt\\n"; ',
      'while IFS= read -r line; do ',
      'printf "\\033[2J\\033[H"; ',
      'if [ "$line" = "blocked" ]; then ',
      'printf "\\033]0;E2E agent\\aWaiting for your input\\n"; ',
      'elif [ "$line" = "failed" ]; then ',
      'printf "\\033]0;E2E agent\\aAPI request failed\\n"; ',
      'else printf "\\033]0;⠦ E2E agent\\aThinking...\\nEsc to interrupt\\n"; fi; ',
      'done\'',
    ].join('')
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', agentPaneId, '-l', '--', command])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', agentPaneId, 'Enter'])

    await expect.poll(async () => {
      const response = await page.request.get('/api/agents')
      const body = await response.json() as { agents: Array<{ paneId: string, status: string }> }
      return body.agents.find(agent => agent.paneId === agentPaneId)?.status
    }).toBe('working')

    await page.reload()
    await page.getByRole('button', { exact: true, name: sessionName }).click()
    await page.getByRole('tab', { name: /^Tmux window 0:/u }).click()
    const agentRow = page.locator(`[data-agent-pane-id="${agentPaneId}"]`)
    await expect(agentRow).toBeVisible()
    await expect(agentRow.locator('[data-agent-status]')).toHaveAttribute('data-status', 'working')
    await expect(agentRow.locator('[data-agent-kind-name]')).toHaveText('Codex')
    await expect(agentRow).toHaveAttribute('data-agent-window-active', 'false')
    const activeSessionGroup = page.locator('[data-session-group-active="true"]')
    await expect(activeSessionGroup.locator('[data-session-active-rail]')).toBeVisible()
    expect(await activeSessionGroup.evaluate(element => getComputedStyle(element).backgroundColor))
      .not.toBe('rgba(0, 0, 0, 0)')

    await agentRow.locator('button').first().click()
    await expect(page.locator(`[data-pane-id="${agentPaneId}"][data-focused="true"]`)).toBeVisible()
    await expect(agentRow).toHaveAttribute('data-agent-window-active', 'true')
    const lightHighlights = await page.evaluate(() => ({
      agent: getComputedStyle(document.querySelector<HTMLElement>('[data-agent-window-active="true"]')!).backgroundColor,
      session: getComputedStyle(document.querySelector<HTMLElement>('[data-session-group-active="true"]')!).backgroundColor,
    }))
    expect(lightHighlights).toEqual({
      agent: 'rgba(36, 38, 43, 0.07)',
      session: 'rgba(36, 38, 43, 0.035)',
    })
    await page.evaluate(() => {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    })
    await expect.poll(() => page.evaluate(() => ({
      agent: getComputedStyle(document.querySelector<HTMLElement>('[data-agent-window-active="true"]')!).backgroundColor,
      session: getComputedStyle(document.querySelector<HTMLElement>('[data-session-group-active="true"]')!).backgroundColor,
    }))).toEqual({
      agent: 'rgba(255, 255, 255, 0.06)',
      session: 'rgba(255, 255, 255, 0.03)',
    })
    await expect.poll(() => new URL(page.url()).pathname).toMatch(
      new RegExp(`/t/${agentWindow.id.slice(1)}$`, 'u'),
    )

    await agentRow.locator('button').first().dblclick()
    const renameInput = page.getByLabel('Rename E2E agent')
    const longInstanceName = 'Review lead for the intentionally very long Bitveins agent instance'
    await renameInput.fill(longInstanceName)
    const renameResponse = page.waitForResponse(response => (
      response.request().method() === 'PATCH'
      && response.url().endsWith(`/api/agents/${agentPaneId.slice(1)}`)
    ))
    await renameInput.press('Enter')
    const renamed = await renameResponse
    expect(renamed.ok(), await renamed.text()).toBe(true)
    await expect(agentRow).toContainText(longInstanceName)
    const nameGeometry = await agentRow.evaluate((element) => {
      const instance = element.querySelector<HTMLElement>('[data-agent-instance-name]')!
      const kind = element.querySelector<HTMLElement>('[data-agent-kind-name]')!
      return {
        instanceClientWidth: instance.clientWidth,
        instanceScrollWidth: instance.scrollWidth,
        kindClientWidth: kind.clientWidth,
        kindScrollWidth: kind.scrollWidth,
        kindRight: Math.round(kind.getBoundingClientRect().right),
        rowRight: Math.round(element.getBoundingClientRect().right),
      }
    })
    expect(nameGeometry.instanceScrollWidth).toBeGreaterThan(nameGeometry.instanceClientWidth)
    expect(nameGeometry.kindScrollWidth).toBeLessThanOrEqual(nameGeometry.kindClientWidth)
    expect(nameGeometry.rowRight - nameGeometry.kindRight).toBeLessThan(30)
    await expect.poll(async () => (await execFileAsync('tmux', [
      '-L', socketName, 'show-options', '-pv', '-t', agentPaneId, '@bitveins_agent_label',
    ])).stdout.trim()).toBe(longInstanceName)

    await page.reload()
    await expect(page.locator(`[data-agent-pane-id="${agentPaneId}"]`)).toContainText(longInstanceName)

    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', agentPaneId, '-l', '--', 'blocked'])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', agentPaneId, 'Enter'])
    await expect(page.locator(`[data-agent-pane-id="${agentPaneId}"] [data-agent-status]`))
      .toHaveAttribute('data-status', 'blocked', { timeout: 10_000 })

    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', agentPaneId, '-l', '--', 'failed'])
    await execFileAsync('tmux', ['-L', socketName, 'send-keys', '-t', agentPaneId, 'Enter'])
    await expect(page.locator(`[data-agent-pane-id="${agentPaneId}"] [data-agent-status]`))
      .toHaveAttribute('data-status', 'failed', { timeout: 10_000 })
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
