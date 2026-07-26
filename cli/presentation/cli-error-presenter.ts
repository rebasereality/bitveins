import {
  CliError,
  CliExitCode,
} from '../core/cli-error'
import type { CliOutput } from '../ports/cli-output'

const assignmentSecretPattern
  = /\b(NUXT_SESSION_PASSWORD|BITVEINS_AUTH_PASSWORD_HASH|password)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu

export function redactSensitiveText(value: string): string {
  return value.replace(
    assignmentSecretPattern,
    (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`,
  )
}

function diagnosticCause(error: unknown): string[] {
  const diagnostics: string[] = []
  const seen = new Set<unknown>()
  let current = error

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    if (current.stack) {
      diagnostics.push(current.stack)
    }
    current = current.cause
  }

  return diagnostics
}

export class CliErrorPresenter {
  constructor(private readonly output: CliOutput) {}

  present(error: unknown, verbose = false): CliExitCode {
    const known = error instanceof CliError
    const message = error instanceof Error ? error.message : String(error)
    this.output.error(redactSensitiveText(message))

    if (known) {
      for (const detail of error.details) {
        this.output.diagnostic(redactSensitiveText(detail))
      }
      if (error.hint) {
        this.output.diagnostic(`hint: ${redactSensitiveText(error.hint)}`)
      }
    }

    if (verbose) {
      for (const diagnostic of diagnosticCause(error)) {
        this.output.diagnostic(redactSensitiveText(diagnostic))
      }
    }

    return known ? error.exitCode : CliExitCode.Failure
  }
}
