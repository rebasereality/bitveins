import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { CodexAppServerThreadMetadataReader } from '../../../../../server/modules/agents/adapters/codex-app-server-thread-metadata-reader'

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false

  kill(): boolean {
    this.killed = true
    return true
  }
}

const NO_RESPONSE = Symbol('NO_RESPONSE')

interface FakeRpcResponse {
  error?: { message?: string }
  result?: unknown
}

function fakeSpawn(
  reply: (
    message: { id?: number, method?: string, params?: Record<string, unknown> },
    child: FakeCodexProcess,
  ) => FakeRpcResponse | typeof NO_RESPONSE,
) {
  const children: FakeCodexProcess[] = []
  const messages: Array<{ id?: number, method?: string, params?: Record<string, unknown> }> = []
  const spawnProcess = vi.fn((..._arguments: unknown[]) => {
    const child = new FakeCodexProcess()
    children.push(child)
    let buffer = ''
    child.stdin.setEncoding('utf8')
    child.stdin.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const message = JSON.parse(buffer.slice(0, newline)) as {
          id?: number
          method?: string
          params?: Record<string, unknown>
        }
        messages.push(message)
        buffer = buffer.slice(newline + 1)
        const response = reply(message, child)
        if (message.id !== undefined) {
          if (response !== NO_RESPONSE) {
            queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, ...response })}\n`))
          }
        }
        newline = buffer.indexOf('\n')
      }
    })
    return child as unknown as ChildProcessWithoutNullStreams
  }) as unknown as typeof spawn
  return { children, messages, spawnProcess }
}

describe('CodexAppServerThreadMetadataReader', () => {
  it('initializes one connection and reads thread names and previews', async () => {
    const threadId = '019ff7b9-2d85-78d2-9cea-eaff30ed6cef'
    const fake = fakeSpawn(message => ({
      result: message.method === 'initialize'
        ? { platformFamily: 'unix' }
        : {
            thread: {
              id: message.params?.threadId,
              name: 'Agent tree',
              preview: 'Implement the agent tree',
            },
          },
    }))
    const reader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 100,
      spawnProcess: fake.spawnProcess,
    })

    await expect(reader.read('/opt/codex', threadId)).resolves.toEqual({
      name: 'Agent tree',
      preview: 'Implement the agent tree',
    })
    await expect(reader.read('/opt/codex', threadId)).resolves.toEqual({
      name: 'Agent tree',
      preview: 'Implement the agent tree',
    })
    expect(fake.spawnProcess).toHaveBeenCalledOnce()
    expect(fake.spawnProcess).toHaveBeenCalledWith('/opt/codex', ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(fake.messages.map(message => message.method)).toEqual([
      'initialize',
      'initialized',
      'thread/read',
      'thread/read',
    ])

    reader.dispose()
    expect(fake.children[0]?.killed).toBe(true)
  })

  it('returns null for malformed thread metadata', async () => {
    const fake = fakeSpawn(message => ({
      result: message.method === 'initialize'
        ? {}
        : { thread: { id: 'different', preview: 42 } },
    }))
    const reader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 100,
      spawnProcess: fake.spawnProcess,
    })

    await expect(reader.read('/opt/codex', 'thread_123')).resolves.toBeNull()
    reader.dispose()
  })

  it('waits for initialization before serving concurrent reads', async () => {
    let initialized = false
    const fake = fakeSpawn((message) => {
      if (message.method === 'initialize') {
        return { result: { platformFamily: 'unix' } }
      }
      if (message.method === 'initialized') {
        initialized = true
        return NO_RESPONSE
      }
      return initialized
        ? { result: { thread: { id: message.params?.threadId, name: null, preview: 'Preview' } } }
        : { error: { message: 'not initialized' } }
    })
    const reader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 100,
      spawnProcess: fake.spawnProcess,
    })

    await expect(Promise.all([
      reader.read('/opt/codex', 'thread_1'),
      reader.read('/opt/codex', 'thread_2'),
    ])).resolves.toEqual([
      { name: null, preview: 'Preview' },
      { name: null, preview: 'Preview' },
    ])
    reader.dispose()
  })

  it('ignores unrelated protocol lines and fails closed on RPC errors', async () => {
    const fake = fakeSpawn((message, child) => {
      if (message.method === 'initialize') {
        queueMicrotask(() => {
          child.stdout.write('not-json\n')
          child.stdout.write('{"method":"server/notification"}\n')
          child.stdout.write('{"id":999,"result":{}}\n')
        })
        return { result: {} }
      }
      return { error: {} }
    })
    const reader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 100,
      spawnProcess: fake.spawnProcess,
    })

    await expect(reader.read('/opt/codex', 'thread_123')).resolves.toBeNull()
    reader.dispose()
  })

  it('fails closed when initialization is invalid or a request times out', async () => {
    const invalid = fakeSpawn(() => ({ result: null }))
    const invalidReader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 100,
      spawnProcess: invalid.spawnProcess,
    })
    await expect(invalidReader.read('/opt/codex', 'thread_123')).resolves.toBeNull()
    expect(invalid.children[0]?.killed).toBe(true)

    const silent = fakeSpawn(message => message.method === 'initialize'
      ? { result: {} }
      : NO_RESPONSE)
    const silentReader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 20,
      spawnProcess: silent.spawnProcess,
    })
    await expect(silentReader.read('/opt/codex', 'thread_123')).resolves.toBeNull()
    expect(silent.children[0]?.killed).toBe(true)
    silentReader.dispose()
  })

  it('validates each thread metadata field', async () => {
    const fake = fakeSpawn((message) => {
      if (message.method === 'initialize') return { result: {} }
      const threadId = String(message.params?.threadId)
      const results: Record<string, unknown> = {
        missing_result: null,
        missing_thread: {},
        invalid_name: { thread: { id: threadId, name: 42, preview: 'Preview' } },
        valid_preview: { thread: { id: threadId, preview: 'Preview only' } },
      }
      return { result: results[threadId] }
    })
    const reader = new CodexAppServerThreadMetadataReader({
      requestTimeoutMs: 100,
      spawnProcess: fake.spawnProcess,
    })

    await expect(reader.read('/opt/codex', 'missing_result')).resolves.toBeNull()
    await expect(reader.read('/opt/codex', 'missing_thread')).resolves.toBeNull()
    await expect(reader.read('/opt/codex', 'invalid_name')).resolves.toBeNull()
    await expect(reader.read('/opt/codex', 'valid_preview')).resolves.toEqual({
      name: null,
      preview: 'Preview only',
    })
    reader.dispose()
  })
})
