import { mkdir } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-18)
const sessionPrefix = `layout_${safeRunId}`
const primarySession = `${sessionPrefix}_00`
const sessionNames = Array.from({ length: 40 }, (_, index) => (
  `${sessionPrefix}_${String(index).padStart(2, '0')}`
))

async function removeFixtureSessions(request: APIRequestContext) {
  await Promise.all(sessionNames.map(name =>
    request.delete(`/api/sessions/${name}`).catch(() => undefined),
  ))
}

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
})

test('renders the compact desktop shell, authenticated Linux account and logout contract', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  let fixturesRemoved = false

  const anonymousSession = await page.request.get('/api/auth/session')
  expect(anonymousSession.ok()).toBe(true)
  expect(await anonymousSession.json()).toEqual({
    authenticated: false,
    linuxUsername: null,
    loggedInAt: null,
  })

  await authenticate(page)

  try {
    for (const name of sessionNames) {
      const response = await page.request.post('/api/sessions', {
        data: { name, path: workspace },
      })
      expect(response.ok(), await response.text()).toBe(true)
    }

    const createdWindows: Array<{ index: number }> = []
    for (let index = 0; index < 7; index += 1) {
      const response = await page.request.post(`/api/sessions/${primarySession}/windows`)
      expect(response.ok(), await response.text()).toBe(true)
      createdWindows.push((await response.json() as { window: { index: number } }).window)
    }

    const allWindows = [{ index: 0 }, ...createdWindows]
    for (const window of allWindows) {
      const name = window.index === 0 ? 'main-shell' : `work-${window.index}`
      const response = await page.request.patch(
        `/api/sessions/${primarySession}/windows/${window.index}`,
        { data: { name } },
      )
      expect(response.ok(), await response.text()).toBe(true)
    }

    await page.reload()
    await page.getByRole('button', { name: primarySession, exact: true }).click()
    await expect(page.locator('[data-connection-state="attached"]')).toBeVisible()
    await page.mouse.move(700, 300)

    const brandLogo = page.locator('[data-sidebar-brand-logo]')
    await expect(brandLogo).toBeVisible()
    await expect(brandLogo).toHaveAttribute('src', '/icons/bitveins-hand-64x64.png')
    expect(await brandLogo.evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      naturalHeight: image.naturalHeight,
      naturalWidth: image.naturalWidth,
    }))).toEqual({
      complete: true,
      naturalHeight: 64,
      naturalWidth: 64,
    })

    const authenticatedSession = await page.request.get('/api/auth/session')
    expect(authenticatedSession.ok()).toBe(true)
    expect(await authenticatedSession.json()).toMatchObject({
      authenticated: true,
      linuxUsername: userInfo().username,
      loggedInAt: expect.any(Number),
    })

    for (const viewport of [
      { width: 1672, height: 941 },
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport)
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector)
          if (!element) throw new Error(`Missing ${selector}`)
          const box = element.getBoundingClientRect()
          return {
            bottom: box.bottom,
            height: box.height,
            top: box.top,
            width: box.width,
          }
        }

        const sessionScroll = document.querySelector<HTMLElement>('[data-sidebar-session-scroll]')
        if (!sessionScroll) throw new Error('Missing session scroll area')

        return {
          account: rect('[data-sidebar-account]'),
          dock: rect('[data-sidebar-dock]'),
          sessionScroll: {
            clientHeight: sessionScroll.clientHeight,
            scrollHeight: sessionScroll.scrollHeight,
          },
          sidebar: rect('[data-bitveins-sidebar]'),
          sidebarHeader: rect('[data-sidebar-header]'),
          terminalHeader: rect('[data-terminal-header]'),
          transfers: rect('[data-sidebar-transfers]'),
        }
      })

      expect(geometry.sidebar.width).toBeCloseTo(192, 0)
      expect(geometry.sidebarHeader.height).toBeCloseTo(36, 0)
      expect(geometry.terminalHeader.height).toBeCloseTo(36, 0)
      expect(geometry.dock.bottom).toBeCloseTo(geometry.sidebar.bottom, 0)
      expect(geometry.transfers.top).toBeLessThan(geometry.account.top)
      expect(geometry.sessionScroll.scrollHeight).toBeGreaterThan(geometry.sessionScroll.clientHeight)
    }

    const activeSession = page.locator('[aria-current="true"]')
    await expect(activeSession).toHaveText(primarySession)
    await page.locator('[data-terminal-host]').hover({ position: { x: 80, y: 80 } })
    expect(await activeSession.evaluate(element => element.matches(':hover'))).toBe(false)
    await expect.poll(() => activeSession.evaluate((element) => {
      const color = getComputedStyle(element).backgroundColor
      const slashAlpha = color.match(/\/\s*([\d.]+)\s*\)$/)?.[1]
      if (slashAlpha) return Number(slashAlpha)
      const rgbaAlpha = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)?.[1]
      return rgbaAlpha ? Number(rgbaAlpha) : color === 'transparent' ? 0 : 1
    })).toBeLessThan(0.05)

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(8)
    await expect(page.getByRole('tab', { name: 'Tmux window 0: main-shell' })).toHaveText('main-shell')
    await expect(page.getByText('0:main-shell', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New tmux window' })).toBeVisible()

    const palette = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        accent: style.getPropertyValue('--bitveins-shell-accent').trim(),
        shell: style.getPropertyValue('--bitveins-shell-bg').trim(),
        terminal: style.getPropertyValue('--bitveins-terminal-bg').trim(),
      }
    })
    expect(palette).toEqual({
      accent: '#818cf8',
      shell: '#1b1e23',
      terminal: '#1c1f24',
    })

    await removeFixtureSessions(page.request)
    fixturesRemoved = true

    const accountButton = page.locator('[data-sidebar-account] > button')
    await expect(accountButton).toContainText(userInfo().username)
    await accountButton.click()
    await expect(page.getByText('Linux user', { exact: true })).toBeVisible()
    const help = page.getByRole('menuitem', { name: 'Help' })
    await help.click()
    const documentation = page.getByRole('menuitem', { name: 'Documentation' })
    const github = page.getByRole('menuitem', { name: 'GitHub' })
    await expect(documentation).toHaveAttribute('href', 'https://rebasereality.com/bitveins')
    await expect(github).toHaveAttribute('href', 'https://github.com/rebasereality/bitveins')
    await expect(documentation).toHaveAttribute('target', '_blank')
    await expect(github).toHaveAttribute('target', '_blank')
    const accountMenuStacking = await page.evaluate(() => {
      const account = document.querySelector<HTMLElement>('[data-sidebar-account]')
      const menu = account?.querySelector<HTMLElement>(':scope > [role="menu"]')
      const prompt = document.querySelector<HTMLElement>('footer')
      const sidebar = document.querySelector<HTMLElement>('[data-bitveins-sidebar]')
      if (!account || !menu || !prompt || !sidebar) {
        throw new Error('Missing account menu stacking fixture.')
      }

      const menuRect = menu.getBoundingClientRect()
      const promptRect = prompt.getBoundingClientRect()
      const overlap = {
        bottom: Math.min(menuRect.bottom, promptRect.bottom),
        left: Math.max(menuRect.left, promptRect.left),
        right: Math.min(menuRect.right, promptRect.right),
        top: Math.max(menuRect.top, promptRect.top),
      }
      if (overlap.right <= overlap.left || overlap.bottom <= overlap.top) {
        throw new Error('The account menu does not overlap the prompt fixture.')
      }

      const topmost = document.elementFromPoint(
        (overlap.left + overlap.right) / 2,
        (overlap.top + overlap.bottom) / 2,
      )

      return {
        footerZIndex: getComputedStyle(prompt).zIndex,
        menuZIndex: getComputedStyle(menu).zIndex,
        sidebarZIndex: getComputedStyle(sidebar).zIndex,
        topmostIsAccountMenu: Boolean(topmost?.closest('[data-sidebar-account]')),
      }
    })
    expect(accountMenuStacking).toEqual({
      footerZIndex: '30',
      menuZIndex: '60',
      sidebarZIndex: '40',
      topmostIsAccountMenu: true,
    })
    await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Logout' }).click()

    await expect(page.getByRole('heading', { name: 'Unlock terminal' })).toBeVisible()
    const loggedOutSession = await page.request.get('/api/auth/session')
    expect(await loggedOutSession.json()).toEqual({
      authenticated: false,
      linuxUsername: null,
      loggedInAt: null,
    })
  }
  finally {
    if (!fixturesRemoved) {
      await removeFixtureSessions(page.request)
    }
  }
})
