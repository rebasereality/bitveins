import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  CodexThreadMetadata,
  CodexThreadMetadataReader,
} from '../ports/codex-thread-metadata-reader'

interface CodexAppServerReaderOptions {
  requestTimeoutMs?: number
  spawnProcess?: typeof spawn
}

interface PendingRequest {
  reject(error: Error): void
  resolve(value: unknown): void
  timer: NodeJS.Timeout
}

interface RpcResponse {
  error?: { code?: number, message?: string }
  id?: number
  result?: unknown
}

const MAX_PROTOCOL_BUFFER = 1024 * 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000

class CodexAppServerConnection {
  private buffer = ''
  private child: ChildProcessWithoutNullStreams | null = null
  private connecting: Promise<void> | null = null
  private disposed = false
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()

  constructor(
    private readonly executable: string,
    private readonly requestTimeoutMs: number,
    private readonly spawnProcess: typeof spawn,
  ) {}

  async readThread(threadId: string): Promise<CodexThreadMetadata | null> {
    try {
      await this.ensureConnected()
      const result = await this.request('thread/read', { includeTurns: false, threadId })
      return parseThreadMetadata(result, threadId)
    }
    catch {
      return null
    }
  }

  dispose(): void {
    this.disposed = true
    this.disconnect(new Error('Codex App Server connection disposed.'))
  }

  private ensureConnected(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Codex App Server connection disposed.'))
    if (this.connecting) return this.connecting
    if (this.child) return Promise.resolve()
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async connect(): Promise<void> {
    const child = this.spawnProcess(this.executable, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    this.buffer = ''
    child.stdout.setEncoding('utf8')
    child.stderr.resume()
    child.stdout.on('data', chunk => this.consume(String(chunk), child))
    child.stdin.on('error', () => this.disconnect(new Error('Codex App Server input closed.'), child))
    child.on('error', error => this.disconnect(error, child))
    child.on('exit', () => this.disconnect(new Error('Codex App Server exited.'), child))

    const initialized = await this.request('initialize', {
      clientInfo: {
        name: 'bitveins',
        title: 'Bitveins',
        version: '1.0.0',
      },
    })
    if (!initialized || typeof initialized !== 'object') {
      this.disconnect(new Error('Codex App Server initialization failed.'), child)
      throw new Error('Codex App Server initialization failed.')
    }
    this.notify('initialized', {})
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.child
    if (!child?.stdin.writable) return Promise.reject(new Error('Codex App Server is unavailable.'))
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex App Server ${method} timed out.`))
        this.disconnect(new Error('Codex App Server request timed out.'), child)
      }, this.requestTimeoutMs)
      timer.unref()
      this.pending.set(id, { reject, resolve, timer })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  private notify(method: string, params: unknown): void {
    if (this.child?.stdin.writable) {
      this.child.stdin.write(`${JSON.stringify({ method, params })}\n`)
    }
  }

  private consume(chunk: string, child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return
    this.buffer += chunk
    if (this.buffer.length > MAX_PROTOCOL_BUFFER) {
      this.disconnect(new Error('Codex App Server response exceeded its limit.'), child)
      return
    }

    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/u, '')
      this.buffer = this.buffer.slice(newline + 1)
      this.consumeLine(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private consumeLine(line: string): void {
    let response: RpcResponse
    try {
      response = JSON.parse(line) as RpcResponse
    }
    catch {
      return
    }
    if (!Number.isSafeInteger(response.id)) return
    const pending = this.pending.get(response.id!)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(response.id!)
    if (response.error) {
      pending.reject(new Error(response.error.message || 'Codex App Server request failed.'))
    }
    else {
      pending.resolve(response.result)
    }
  }

  private disconnect(error: Error, expectedChild?: ChildProcessWithoutNullStreams): void {
    const child = this.child
    if (!child || (expectedChild && child !== expectedChild)) return
    this.child = null
    this.buffer = ''
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    if (!child.killed) child.kill('SIGTERM')
  }
}

export class CodexAppServerThreadMetadataReader implements CodexThreadMetadataReader {
  private readonly connections = new Map<string, CodexAppServerConnection>()
  private readonly requestTimeoutMs: number
  private readonly spawnProcess: typeof spawn

  constructor(options: CodexAppServerReaderOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.spawnProcess = options.spawnProcess ?? spawn
  }

  read(executable: string, threadId: string): Promise<CodexThreadMetadata | null> {
    let connection = this.connections.get(executable)
    if (!connection) {
      connection = new CodexAppServerConnection(executable, this.requestTimeoutMs, this.spawnProcess)
      this.connections.set(executable, connection)
    }
    return connection.readThread(threadId)
  }

  dispose(): void {
    for (const connection of this.connections.values()) connection.dispose()
    this.connections.clear()
  }
}

function parseThreadMetadata(value: unknown, expectedThreadId: string): CodexThreadMetadata | null {
  if (!value || typeof value !== 'object') return null
  const thread = (value as { thread?: unknown }).thread
  if (!thread || typeof thread !== 'object') return null
  const candidate = thread as { id?: unknown, name?: unknown, preview?: unknown }
  if (candidate.id !== expectedThreadId || typeof candidate.preview !== 'string') return null
  if (candidate.name !== null && candidate.name !== undefined && typeof candidate.name !== 'string') return null
  return {
    name: typeof candidate.name === 'string' ? candidate.name : null,
    preview: candidate.preview,
  }
}
