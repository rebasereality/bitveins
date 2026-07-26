import { stat } from 'node:fs/promises'
import type { PathInspector } from '../ports/path-inspector'

export class NodePathInspector implements PathInspector {
  async isDirectory(path: string): Promise<boolean> {
    return (await stat(path)).isDirectory()
  }
}
