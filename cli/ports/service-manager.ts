export interface ServiceManager {
  daemonReload(): Promise<void>
  disable(): Promise<void>
  enableAndStart(): Promise<void>
  isActive(): Promise<boolean>
  logs(follow: boolean): Promise<void>
  restart(): Promise<void>
  start(): Promise<void>
  status(): Promise<void>
  stop(): Promise<void>
}
