import type { Page } from '@playwright/test'

export async function ctrlHoverFirstTerminalLink(
  page: Page,
  resolutionRequestCount: () => number,
): Promise<boolean> {
  const screen = page.locator('.xterm-screen').first()
  const screenBox = await screen.boundingBox()
  const terminalElement = page.locator('.xterm').first()
  const terminalBox = await terminalElement.boundingBox()
  if (!screenBox || !terminalBox) throw new Error('The xterm terminal has no bounding box.')

  const metrics = await page.locator('.xterm-char-measure-element').first().evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const terminal = element.closest('.xterm')
    if (!terminal) throw new Error('The xterm root element is unavailable.')
    const style = window.getComputedStyle(terminal)
    return {
      height: rect.height,
      paddingLeft: Number.parseFloat(style.paddingLeft) || 0,
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      width: rect.width,
    }
  })
  if (metrics.width <= 0 || metrics.height <= 0) {
    throw new Error('Xterm character metrics are unavailable.')
  }

  const rows = Math.floor(screenBox.height / metrics.height)
  const columns = Math.floor(screenBox.width / metrics.width)
  const originX = terminalBox.x + metrics.paddingLeft
  const originY = terminalBox.y + metrics.paddingTop
  await page.keyboard.down('Control')

  for (let row = 0; row < rows; row += 1) {
    const requestCountBeforeHover = resolutionRequestCount()
    await page.mouse.move(
      originX + 0.5 * metrics.width,
      originY + (row + 0.5) * metrics.height,
    )
    await page.waitForTimeout(30)
    if (resolutionRequestCount() > requestCountBeforeHover) {
      await page.waitForTimeout(350)
    }
    if (await page.locator('.xterm-cursor-pointer').count() > 0) {
      return true
    }
    for (let column = 0; column < columns; column += 4) {
      await page.mouse.move(
        originX + (column + 0.5) * metrics.width,
        originY + (row + 0.5) * metrics.height,
      )
      await page.waitForTimeout(10)
      if (await page.locator('.xterm-cursor-pointer').count() > 0) {
        return true
      }
    }
  }

  await page.keyboard.up('Control')
  return false
}
