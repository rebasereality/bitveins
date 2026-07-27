import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { authenticate } from './support/authenticate'

const runId = process.env.BITVEINS_E2E_RUN_ID
const workspace = process.env.BITVEINS_E2E_WORKSPACE

if (!runId || !workspace) {
  throw new Error('Playwright did not configure the isolated Bitveins E2E environment.')
}

const safeRunId = runId.replaceAll(/[^A-Za-z0-9]/g, '').slice(-20)
const sessionName = `downloads_${safeRunId}`
const fileName = 'download-note.txt'
const filePath = join(workspace, fileName)

async function expectDownload(page: Page, action: () => Promise<void>) {
  const downloadPromise = page.waitForEvent('download')
  await action()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(fileName)
}

test.beforeAll(async () => {
  await mkdir(workspace, { recursive: true })
  await writeFile(filePath, 'Bitveins Explorer download fixture.\n')
})

test('downloads the path entered in the global Download dialog', async ({ page }) => {
  await authenticate(page)

  await page.locator('[data-sidebar-account] > button').click()
  await page.getByRole('menuitem', { name: 'Download file' }).click()
  await page.getByLabel('Path on VM (file or folder)').fill(filePath)

  await expectDownload(page, async () => {
    await page.getByRole('button', { name: 'Download', exact: true }).click()
  })

  await expect(page.getByRole('heading', {
    name: 'Download file or folder from VM',
  })).toBeHidden()
})

test('downloads an Explorer file from its tree, tab and active-file action', async ({ page }) => {
  await authenticate(page)

  try {
    const created = await page.request.post('/api/sessions', {
      data: { name: sessionName, path: workspace },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: `Open session ${sessionName}` }).click()
    await page.getByRole('button', { name: 'Files', exact: true }).click()

    const treeFile = page.getByText(fileName, { exact: true })
    await expect(treeFile).toBeVisible()
    await treeFile.click({ button: 'right' })
    await expectDownload(page, async () => {
      await page.getByRole('button', { name: 'Download', exact: true }).click()
    })

    await treeFile.dblclick()
    const tab = page.locator('[data-explorer-tab]').filter({ hasText: fileName })
    await expect(tab).toBeVisible()
    await tab.click({ button: 'right' })
    await expectDownload(page, async () => {
      await page.getByRole('button', { name: 'Download', exact: true }).click()
    })

    await expectDownload(page, async () => {
      await page.getByTitle('Download active file').click()
    })
  }
  finally {
    await page.request.delete(`/api/sessions/${sessionName}`).catch(() => undefined)
  }
})
