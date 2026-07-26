export interface ServiceUnitRepository {
  install(): Promise<void>
  readOptional(): Promise<string | null>
  restore(content: string | null): Promise<void>
}
