export const CliExitCode = {
  Failure: 1,
  Integrity: 5,
  Prerequisite: 4,
  Success: 0,
  Unhealthy: 3,
  Usage: 2,
} as const

export type CliExitCode = typeof CliExitCode[keyof typeof CliExitCode]

interface CliErrorOptions extends ErrorOptions {
  readonly details?: readonly string[]
  readonly exitCode?: CliExitCode
  readonly hint?: string
}

export class CliError extends Error {
  readonly details: readonly string[]
  readonly exitCode: CliExitCode
  readonly hint?: string

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'CliError'
    this.details = options.details ?? []
    this.exitCode = options.exitCode ?? CliExitCode.Failure
    this.hint = options.hint
  }
}

export class CliUsageError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, 'exitCode'> = {}) {
    super(message, { ...options, exitCode: CliExitCode.Usage })
    this.name = 'CliUsageError'
  }
}

export class CliPrerequisiteError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, 'exitCode'> = {}) {
    super(message, { ...options, exitCode: CliExitCode.Prerequisite })
    this.name = 'CliPrerequisiteError'
  }
}

export class CliConfigurationError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, 'exitCode'> = {}) {
    super(message, { ...options, exitCode: CliExitCode.Prerequisite })
    this.name = 'CliConfigurationError'
  }
}

export class CliServiceError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, 'exitCode'> = {}) {
    super(message, { ...options, exitCode: CliExitCode.Prerequisite })
    this.name = 'CliServiceError'
  }
}

export class CliIntegrityError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, 'exitCode'> = {}) {
    super(message, { ...options, exitCode: CliExitCode.Integrity })
    this.name = 'CliIntegrityError'
  }
}

export class CliTransactionError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, 'exitCode'> = {}) {
    super(message, options)
    this.name = 'CliTransactionError'
  }
}
