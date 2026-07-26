import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)
const sessionName = `settings_${safeRunId}`

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test('keeps desktop and mobile appearance profiles independent without remounting the terminal', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    const terminalPane = page.locator('[data-connection-state="attached"]')
    await expect(terminalPane).toHaveCount(1)
    await terminalPane.evaluate((element) => {
      element.setAttribute('data-settings-preservation-probe', 'mounted-before-settings')
    })

    await page.locator('[data-sidebar-account] > button').click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()

    const settings = page.getByRole('region', { name: 'Settings' })
    const appSidebar = page.locator('[data-bitveins-sidebar]')
    await expect(settings).toBeVisible()
    await expect(appSidebar).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
    await expect(page.locator('[data-appearance-device]')).toHaveText('Desktop')
    await expect(terminalPane).toHaveCount(1)
    await expect(terminalPane).toBeHidden()
    await expect(page.locator('textarea:not(.xterm-helper-textarea)')).toBeHidden()

    const shellBounds = await Promise.all([
      appSidebar.boundingBox(),
      settings.boundingBox(),
    ])
    expect(shellBounds[0]).not.toBeNull()
    expect(shellBounds[1]).not.toBeNull()
    expect(shellBounds[1]!.x).toBeGreaterThanOrEqual(
      shellBounds[0]!.x + shellBounds[0]!.width - 1,
    )

    const sliderGeometry = await page.locator(
      '[data-appearance-setting="Interface font size"]',
    ).evaluate((section) => {
      const range = section.querySelector<HTMLInputElement>('input[type="range"]')!
      const rangeBounds = range.getBoundingClientRect()
      const markers = Array.from(section.querySelectorAll<HTMLElement>('.appearance-step-marker'))
      const labels = Array.from(section.querySelectorAll<HTMLElement>('[data-appearance-step]'))
      return markers.map((marker, index) => {
        const markerBounds = marker.getBoundingClientRect()
        const labelBounds = labels[index]!.getBoundingClientRect()
        return {
          expected: rangeBounds.left + 7 + ((rangeBounds.width - 14) * index / 4),
          label: labelBounds.left + labelBounds.width / 2,
          marker: markerBounds.left + markerBounds.width / 2,
        }
      })
    })
    expect(sliderGeometry).toHaveLength(5)
    for (const step of sliderGeometry) {
      expect(Math.abs(step.label - step.marker)).toBeLessThanOrEqual(1)
      expect(Math.abs(step.expected - step.marker)).toBeLessThanOrEqual(1)
    }

    const promptFont = page.locator('textarea:not(.xterm-helper-textarea)')
    const promptFontSwitch = page.getByRole('switch', { name: 'Monospaced font' })
    await expect(promptFontSwitch).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => promptFont.evaluate(
      element => getComputedStyle(element).fontFamily,
    )).toContain('JetBrains Mono')

    await page.getByRole('button', { name: 'Use Blue main color' }).click()
    await expect.poll(() => page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        accent: style.getPropertyValue('--bitveins-shell-accent').trim(),
        contrast: style.getPropertyValue('--bitveins-accent-contrast').trim(),
        primary: style.getPropertyValue('--ui-primary').trim(),
      }
    })).toEqual({
      accent: '#60a5fa',
      contrast: '#111827',
      primary: '#60a5fa',
    })
    await expect(page.locator('[data-accent-contrast-preview]')).toHaveCSS(
      'color',
      'rgb(17, 24, 39)',
    )

    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await expect.poll(() => page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        accent: style.getPropertyValue('--bitveins-shell-accent').trim(),
        contrast: style.getPropertyValue('--bitveins-accent-contrast').trim(),
      }
    })).toEqual({
      accent: '#2563eb',
      contrast: '#ffffff',
    })
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect.poll(() => page.evaluate(
      () => getComputedStyle(document.documentElement)
        .getPropertyValue('--bitveins-shell-accent')
        .trim(),
    )).toBe('#60a5fa')

    await promptFontSwitch.click()
    await expect(promptFontSwitch).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => promptFont.evaluate(
      element => getComputedStyle(element).fontFamily,
    )).toContain('Inter Variable')
    await expect.poll(() => page.locator('[data-input-preview] > div').evaluate(
      element => getComputedStyle(element).fontFamily,
    )).toContain('Inter Variable')

    await page.getByRole('slider', { name: 'Interface font size' }).fill('2')
    await expect(page.locator('[data-appearance-setting="Interface font size"] output')).toHaveText('14px')
    await expect.poll(() => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--bitveins-ui-font-size').trim(),
    )).toBe('14px')
    await expect.poll(() => page.locator('[data-interface-preview]').evaluate(
      element => getComputedStyle(element).fontSize,
    )).toBe('14px')

    await page.getByRole('slider', { name: 'Terminal font size' }).fill('4')
    await expect(page.locator('[data-appearance-setting="Terminal font size"] output')).toHaveText('18px')
    await expect.poll(() => page.locator('[data-terminal-preview]').evaluate(
      element => getComputedStyle(element).fontSize,
    )).toBe('18px')
    await expect.poll(() => page.locator('.xterm-char-measure-element').first().evaluate(
      element => getComputedStyle(element).fontSize,
    )).toBe('18px')

    await page.getByRole('slider', { name: 'Input font size' }).fill('3')
    await expect(page.locator('[data-appearance-setting="Input font size"] output')).toHaveText('22px')
    await expect.poll(() => page.locator('[data-input-preview] > div').evaluate((element) => {
      const style = getComputedStyle(element)
      return { fontSize: style.fontSize, minHeight: style.minHeight }
    })).toEqual({ fontSize: '22px', minHeight: '80px' })

    await page.setViewportSize({ width: 412, height: 915 })
    await expect(page.locator('[data-appearance-device]')).toHaveText('Mobile')
    await expect.poll(() => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--bitveins-ui-font-size').trim(),
    )).toBe('12px')
    await expect(page.locator('[data-appearance-setting="Terminal font size"] output')).toHaveText('14px')
    await expect(page.locator('[data-appearance-setting="Input font size"] output')).toHaveText('16px')
    await expect.poll(() => page.locator('.xterm-char-measure-element').first().evaluate(
      element => getComputedStyle(element).fontSize,
    )).toBe('14px')

    await page.getByRole('slider', { name: 'Interface font size' }).fill('1')
    await page.getByRole('slider', { name: 'Terminal font size' }).fill('1')
    await page.getByRole('slider', { name: 'Input font size' }).fill('1')
    await expect(page.locator('[data-appearance-setting="Interface font size"] output')).toHaveText('13px')
    await expect(page.locator('[data-appearance-setting="Terminal font size"] output')).toHaveText('15px')
    await expect(page.locator('[data-appearance-setting="Input font size"] output')).toHaveText('18px')

    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(page.locator('[data-appearance-device]')).toHaveText('Desktop')
    await expect(page.locator('[data-appearance-setting="Interface font size"] output')).toHaveText('14px')
    await expect(page.locator('[data-appearance-setting="Terminal font size"] output')).toHaveText('18px')
    await expect(page.locator('[data-appearance-setting="Input font size"] output')).toHaveText('22px')

    const stored = await page.evaluate(() => window.localStorage.getItem('bitveins.appearance.v2'))
    expect(JSON.parse(stored || '{}')).toEqual({
      desktop: {
        interfaceScale: 2,
        terminalScale: 4,
        inputScale: 3,
      },
      mobile: {
        interfaceScale: 1,
        terminalScale: 1,
        inputScale: 1,
      },
    })
    await expect.poll(() => page.evaluate(
      () => window.localStorage.getItem('bitveins.appearance.accent'),
    )).toBe('blue')
    await expect.poll(() => page.evaluate(
      () => window.localStorage.getItem('bitveins.appearance.prompt-monospace'),
    )).toBe('false')

    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect(settings).toHaveCount(0)
    await expect(terminalPane).toBeVisible()
    await expect(terminalPane).toHaveAttribute(
      'data-settings-preservation-probe',
      'mounted-before-settings',
    )
    await expect(page.locator('textarea:not(.xterm-helper-textarea)')).toHaveCSS('font-size', '22px')
    await expect(page.locator('textarea:not(.xterm-helper-textarea)')).toHaveCSS('min-height', '80px')
    await expect.poll(() => page.locator('textarea:not(.xterm-helper-textarea)').evaluate(
      element => getComputedStyle(element).fontFamily,
    )).toContain('Inter Variable')
    await expect(page.getByRole('button', { name: 'Async', exact: true })).toHaveCSS(
      'color',
      'rgb(17, 24, 39)',
    )

    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect.poll(() => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--bitveins-ui-font-size').trim(),
    )).toBe('14px')
    await expect(page.locator('textarea:not(.xterm-helper-textarea)')).toHaveCSS('font-size', '22px')
    await expect.poll(() => page.evaluate(
      () => document.documentElement.dataset.bitveinsAccent,
    )).toBe('blue')
    await expect.poll(() => page.evaluate(
      () => document.documentElement.dataset.bitveinsPromptMonospace,
    )).toBe('false')

    await page.setViewportSize({ width: 412, height: 915 })
    await page.reload()
    await expect.poll(() => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--bitveins-ui-font-size').trim(),
    )).toBe('13px')
    await page.getByLabel('Open sessions').click()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await expect.poll(() => page.locator('.xterm-char-measure-element').first().evaluate(
      element => getComputedStyle(element).fontSize,
    )).toBe('15px')
    await expect(page.locator('input[readonly][placeholder^="Type command"]')).toHaveCSS('font-size', '18px')
    await expect.poll(() => page.locator('input[readonly][placeholder^="Type command"]').evaluate(
      element => getComputedStyle(element).fontFamily,
    )).toContain('Inter Variable')
    await page.locator('input[readonly][placeholder^="Type command"]').click()
    const mobilePrompt = page.locator('textarea:not(.xterm-helper-textarea)').last()
    await expect(mobilePrompt).toBeVisible()
    await expect.poll(() => mobilePrompt.evaluate(
      element => getComputedStyle(element).fontFamily,
    )).toContain('Inter Variable')
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
