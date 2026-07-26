export interface CliOutput {
  diagnostic(message: string): void
  error(message: string): void
  info(message: string): void
  success(message: string): void
}
