import type { Buffer } from 'node:buffer'

export interface Disposable {
  dispose(): void
}

export interface PtyExitEvent {
  exitCode: number
  signal?: number
}

export interface PtyProcess {
  kill(): void
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (event: PtyExitEvent) => void): Disposable
  resize(columns: number, rows: number): void
  write(data: string | Buffer): void
}

export interface PtySpawnOptions {
  cols: number
  cwd: string
  env: Record<string, string | undefined>
  name: string
  rows: number
}

export interface PtyFactory {
  spawn(command: string, args: readonly string[], options: PtySpawnOptions): PtyProcess
}
