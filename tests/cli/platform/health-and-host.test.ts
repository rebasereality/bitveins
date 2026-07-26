import { createServer, type Server } from 'node:net'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { waitForBitveinsHealth } from '../../../cli/platform/health-check'
import { NodeHealthProbe } from '../../../cli/platform/node-health-probe'
import { NodeHostInspector } from '../../../cli/platform/node-host-inspector'
import { isLoopbackPortAvailable } from '../../../cli/platform/port-availability'
import type {
  CommandResult,
  CommandRunner,
  RunCommandOptions,
} from '../../../cli/ports/command-runner'

class HostCommandRunner implements CommandRunner {
  paths = new Map<string, string>()
  results: CommandResult[] = []

  async run(
    _command: string,
    _args: readonly string[] = [],
    _options: RunCommandOptions = {},
  ): Promise<CommandResult> {
    return this.results.shift() ?? {
      exitCode: 0,
      stderr: '',
      stdout: '',
    }
  }

  async which(command: string): Promise<string | null> {
    return this.paths.get(command) ?? null
  }
}

const servers: Server[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(async server => await new Promise<void>(
    resolve => server.close(() => resolve()),
  )))
})

async function occupiedLoopbackPort(): Promise<number> {
  const server = createServer()
  servers.push(server)
  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind test server.'))
        return
      }
      resolve(address.port)
    })
  })
}

describe('Bitveins health checks', () => {
  it('returns immediately for a healthy loopback response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
    }))

    await expect(waitForBitveinsHealth(4567, {
      attempts: 1,
      fetcher,
    })).resolves.toEqual({
      status: 200,
      url: 'http://127.0.0.1:4567/api/auth/session',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/api/auth/session',
      { redirect: 'manual' },
    )

    vi.stubGlobal('fetch', fetcher)
    await expect(waitForBitveinsHealth(4567)).resolves.toMatchObject({
      status: 200,
    })
    vi.unstubAllGlobals()
  })

  it('retries transport and HTTP failures before reporting the cause', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))

    await expect(waitForBitveinsHealth(4567, {
      attempts: 2,
      delayMs: 0,
      fetcher,
    })).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: 'Health endpoint returned HTTP 503.',
      }),
    })
  })

  it('exposes the same behavior through the HealthProbe adapter', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
    }))

    await expect(new NodeHealthProbe(fetcher).waitUntilHealthy(4567))
      .resolves.toBeUndefined()
  })
})

describe('NodeHostInspector', () => {
  it('reports runtime, disk, command, linger and listener information', async () => {
    const commands = new HostCommandRunner()
    commands.paths.set('tmux', '/usr/bin/tmux')
    commands.paths.set('loginctl', '/usr/bin/loginctl')
    commands.paths.set('ss', '/usr/bin/ss')
    commands.results.push(
      { exitCode: 0, stderr: '', stdout: 'yes\n' },
      {
        exitCode: 0,
        stderr: '',
        stdout: 'LISTEN 0 4096 127.0.0.1:4567 0.0.0.0:*\n',
      },
    )
    const inspector = new NodeHostInspector(commands, {
      architecture: 'x64',
      platform: 'linux',
      uid: 1000,
    })

    expect(inspector.runtime()).toEqual({
      architecture: 'x64',
      platform: 'linux',
      uid: 1000,
    })
    expect(await inspector.availableBytes('/tmp')).toBeGreaterThan(0)
    await expect(inspector.availableBytes('/path/that/does/not/exist'))
      .resolves.toBeNull()
    await expect(inspector.hasCommand('tmux')).resolves.toBe(true)
    await expect(inspector.hasCommand('missing')).resolves.toBe(false)
    await expect(inspector.lingerEnabled()).resolves.toBe(true)
    await expect(inspector.listenerAddresses(4567)).resolves.toEqual([
      '127.0.0.1:4567',
    ])
  })

  it('returns unknown when host inspection tools are unavailable', async () => {
    const inspector = new NodeHostInspector(new HostCommandRunner())

    expect(inspector.runtime()).toEqual({
      architecture: process.arch,
      platform: process.platform,
      uid: process.getuid?.() ?? -1,
    })
    await expect(inspector.lingerEnabled()).resolves.toBeNull()
    await expect(inspector.listenerAddresses(4567)).resolves.toBeNull()
  })

  it('checks loopback port availability without binding public interfaces', async () => {
    const port = await occupiedLoopbackPort()
    const inspector = new NodeHostInspector(new HostCommandRunner())

    await expect(isLoopbackPortAvailable(0)).resolves.toBe(true)
    await expect(inspector.loopbackPortAvailable(port)).resolves.toBe(false)
  })
})
