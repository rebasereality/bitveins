import { spawn } from 'node-pty'
import type { PtyFactory, PtyProcess, PtySpawnOptions } from '../ports/pty-factory'

export class NodePtyFactory implements PtyFactory {
  spawn(command: string, args: readonly string[], options: PtySpawnOptions): PtyProcess {
    return spawn(command, [...args], options)
  }
}
