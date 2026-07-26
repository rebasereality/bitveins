import { describe, expect, it, vi } from 'vitest'
import { createRenameWindowHandler } from '../../../../../server/modules/sessions/delivery/rename-window-handler'

describe('createRenameWindowHandler', () => {
  it('validates and delegates a typed rename request', async () => {
    const renameWindow = vi.fn(async () => ({
      active: true,
      id: '@1',
      index: 1,
      name: 'logs',
      path: '/workspace',
    }))
    const handler = createRenameWindowHandler({ renameWindow })

    await expect(handler({
      body: { name: ' logs ' },
      index: '1',
      sessionName: 'main',
    })).resolves.toMatchObject({
      window: { name: 'logs' },
    })
    expect(renameWindow).toHaveBeenCalledWith('main', '1', ' logs ')
  })

  it.each([
    [{}, 'A window name is required.'],
    [{ name: 123 }, 'A window name is required.'],
    [{ name: 'bad\nname' }, 'Window names must be 1-80 characters'],
  ])('maps invalid body %j to an HTTP 400', async (body, message) => {
    const handler = createRenameWindowHandler({
      renameWindow: vi.fn(async () => null),
    })

    await expect(handler({
      body,
      index: '0',
      sessionName: 'dev',
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining(message),
    })
  })

  it('passes explicit empty defaults when route parameters are absent', async () => {
    const renameWindow = vi.fn(async () => null)
    const handler = createRenameWindowHandler({ renameWindow })

    await handler({
      body: { name: 'logs' },
    })

    expect(renameWindow).toHaveBeenCalledWith('', undefined, 'logs')
  })
})
