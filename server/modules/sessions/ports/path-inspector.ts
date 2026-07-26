export interface PathInspector {
  isDirectory(path: string): Promise<boolean>
}
