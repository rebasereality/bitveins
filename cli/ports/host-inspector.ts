export interface HostRuntime {
  architecture: string
  platform: NodeJS.Platform
  uid: number
}

export interface HostInspector {
  availableBytes(path: string): Promise<number | null>
  hasCommand(command: string): Promise<boolean>
  lingerEnabled(): Promise<boolean | null>
  listenerAddresses(port: number): Promise<readonly string[] | null>
  loopbackPortAvailable(port: number): Promise<boolean>
  runtime(): HostRuntime
}
