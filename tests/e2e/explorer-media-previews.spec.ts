import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-24)
const sessionName = `media_${safeRunId}`
const mediaWorkspace = join(workspace, sessionName)
const tinyMp4 = Buffer.from(
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAN0bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAADIAAAEAAABAAAAAAIXbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAACgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAHZIAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAFAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAOGN0dHMAAAAAAAAABQAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAUAAAABAAAAKHN0c3oAAAAAAAAAAAAAAAUAAALFAAAADAAAAAwAAAAMAAAADAAAABRzdGNvAAAAAAAAAAEAAAOkAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMAAAAAhmcmVlAAAC/W1kYXQAAAKuBgX//6rcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49MjUgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAPZYiEADP//vbsvgU2FMjBAAAACEGaJGxCv/7AAAAACEGeQniF/8GBAAAACAGeYXRCv8SAAAAACAGeY2pCv8SB',
  'base64',
)

test.beforeAll(async () => {
  await mkdir(mediaWorkspace, { recursive: true })
  await Promise.all([
    writeFile(join(mediaWorkspace, 'README.md'), '# Rendered Markdown\n\n![Vector](diagram.svg)\n'),
    writeFile(
      join(mediaWorkspace, 'diagram.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#818cf8"/></svg>',
    ),
    writeFile(join(mediaWorkspace, 'demo.mp4'), tinyMp4),
    writeFile(join(mediaWorkspace, 'unsupported.heic'), Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])),
    sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: '#818cf8',
      },
    }).tiff().toFile(join(mediaWorkspace, 'preview.tiff')),
  ])
})

test('previews source media, streams video ranges and keeps tabs inside the main pane', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: mediaWorkspace },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: sessionName, exact: true }).click()
    await page.getByRole('button', { name: 'Files', exact: true }).click()

    const tree = page.locator('[data-explorer-tree]')
    const treeHeader = page.locator('[data-explorer-tree-header]')
    const tabBar = page.locator('[data-explorer-tab-bar]')
    await expect(tree).toBeVisible()
    await expect(tabBar).toBeVisible()
    const [treeBox, treeHeaderBox, tabBarBox] = await Promise.all([
      tree.boundingBox(),
      treeHeader.boundingBox(),
      tabBar.boundingBox(),
    ])
    expect(treeBox?.y).toBe(tabBarBox?.y)
    expect(treeHeaderBox?.height).toBe(tabBarBox?.height)

    await page.getByText('README.md', { exact: true }).dblclick()
    await expect(page.locator('[data-markdown-preview]')).toContainText('Rendered Markdown')
    const previewButton = page.getByTitle('Show source')
    await expect(previewButton).toBeVisible()
    const previewColors = await previewButton.evaluate((element) => {
      const styles = getComputedStyle(element)
      return {
        background: styles.backgroundColor,
        foreground: styles.color,
      }
    })
    expect(previewColors.background).not.toBe(previewColors.foreground)
    expect(previewColors.background).not.toBe('rgba(0, 0, 0, 0)')
    await previewButton.click()
    await expect(page.locator('.cm-editor')).toBeVisible()
    await page.getByTitle('Show preview').click()
    await expect(page.locator('[data-markdown-preview] img')).toBeVisible()

    await page.getByText('diagram.svg', { exact: true }).dblclick()
    await expect(page.locator('[data-svg-preview] img')).toBeVisible()
    await page.getByTitle('Show source').click()
    await expect(page.locator('.cm-editor')).toBeVisible()

    await page.getByText('preview.tiff', { exact: true }).dblclick()
    await expect(page.getByRole('img', { name: 'preview.tiff' })).toBeVisible()

    const svgTab = page.locator('[data-explorer-tab]').filter({ hasText: 'diagram.svg' })
    await svgTab.click({ button: 'middle' })
    await expect(svgTab).toHaveCount(0)

    const rangeResponse = await page.request.get(
      `/api/sessions/${sessionName}/files/video`,
      {
        headers: { range: 'bytes=4-7' },
        params: { path: 'demo.mp4' },
      },
    )
    expect(rangeResponse.status()).toBe(206)
    expect(rangeResponse.headers()).toMatchObject({
      'accept-ranges': 'bytes',
      'content-length': '4',
      'content-range': `bytes 4-7/${tinyMp4.length}`,
      'content-type': 'video/mp4',
    })
    expect(Buffer.from(await rangeResponse.body()).toString()).toBe('ftyp')

    await page.getByText('demo.mp4', { exact: true }).dblclick()
    await expect(page.locator('[data-video-preview] video')).toBeVisible()
    await expect.poll(() => page.locator('video').evaluate(element => (
      (element as HTMLVideoElement).readyState
    ))).toBeGreaterThanOrEqual(1)

    await page.getByText('unsupported.heic', { exact: true }).dblclick()
    await expect(page.getByText('No preview available', { exact: true })).toBeVisible()
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
