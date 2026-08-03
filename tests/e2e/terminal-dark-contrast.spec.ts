import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdir } from 'node:fs/promises'
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

const configuredSocketName: string = socketName
const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)
const sessionName = `contrast_${safeRunId}`
const hermesExecutable = `${workspace}/hermes`

const foregroundMarker = 'HERMES_DARK_TEXT'
const backgroundMarker = 'HERMES_DARK_SURFACE'
const liveForegroundMarker = 'HERMES_LIVE_DARK_TEXT'

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
  await copyFile('/usr/bin/bash', hermesExecutable)
  await chmod(hermesExecutable, 0o755)
})

test('keeps Hermes ANSI 234 text readable without changing ANSI 234 surfaces', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-l',
      '-t',
      sessionName,
      `exec ${hermesExecutable} --noprofile --norc`,
    ])
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-t',
      sessionName,
      'Enter',
    ])
    await expect.poll(async () => {
      const { stdout } = await execFileAsync('tmux', [
        '-L',
        configuredSocketName,
        'display-message',
        '-p',
        '-t',
        sessionName,
        '#{pane_current_command}',
      ])
      return stdout.trim()
    }).toBe('hermes')

    const command = [
      'printf \'\\033[2J\\033[H',
      `\\033[38;5;234m${foregroundMarker}\\033[39m\\n`,
      `\\033[48;5;234m${backgroundMarker}\\033[49m\\n'`,
    ].join('')
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-l',
      '-t',
      sessionName,
      command,
    ])
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-t',
      sessionName,
      'Enter',
    ])

    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    const terminalRows = page.locator('.xterm-rows')
    await expect(terminalRows).toContainText(foregroundMarker)
    await expect(terminalRows).toContainText(backgroundMarker)

    const foregroundRow = page.getByText(foregroundMarker, { exact: true }).last()
    await expect.poll(() => foregroundRow.evaluate(
      element => getComputedStyle(element).color,
    )).toBe('rgb(223, 226, 232)')

    const backgroundRow = page.getByText(backgroundMarker, { exact: true }).last()
    await expect.poll(() => backgroundRow.evaluate((element) => {
      return [element, ...element.querySelectorAll('*')]
        .map(span => getComputedStyle(span).backgroundColor)
        .find(color => color !== 'rgba(0, 0, 0, 0)') ?? null
    })).toBe('rgb(28, 28, 28)')

    await page.locator('[data-sidebar-account] > button').click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect.poll(() => foregroundRow.evaluate(
      element => getComputedStyle(element).color,
    )).toBe('rgb(36, 38, 43)')

    await page.locator('[data-sidebar-account] > button').click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect.poll(() => foregroundRow.evaluate(
      element => getComputedStyle(element).color,
    )).toBe('rgb(223, 226, 232)')

    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-l',
      '-t',
      sessionName,
      `printf '\\033[38;5;234m${liveForegroundMarker}\\033[39m\\n'`,
    ])
    await execFileAsync('tmux', [
      '-L',
      configuredSocketName,
      'send-keys',
      '-t',
      sessionName,
      'Enter',
    ])

    const liveForegroundRow = page.getByText(liveForegroundMarker, { exact: true }).last()
    await expect(liveForegroundRow).toBeVisible()
    await expect.poll(() => liveForegroundRow.evaluate(
      element => getComputedStyle(element).color,
    )).toBe('rgb(223, 226, 232)')
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
