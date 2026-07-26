export interface OperationLock {
  run<T>(operation: () => Promise<T>): Promise<T>
}
