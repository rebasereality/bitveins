import { CliUsageError } from '../core/cli-error'

export class CommandArguments {
  private readonly values: string[]

  constructor(args: readonly string[]) {
    this.values = [...args]
  }

  flag(name: string): boolean {
    const positions = this.positions(name)
    if (positions.length > 1) {
      throw new CliUsageError(`${name} may only be provided once.`)
    }
    if (positions.length === 0) {
      return false
    }
    this.values.splice(positions[0]!, 1)
    return true
  }

  positional(label: string): string | undefined {
    const index = this.values.findIndex(value => !value.startsWith('-'))
    if (index === -1) {
      return undefined
    }
    const [value] = this.values.splice(index, 1)
    if (!value) {
      throw new CliUsageError(`${label} is required.`)
    }
    return value
  }

  value(name: string): string | undefined {
    const positions = this.positions(name)
    if (positions.length > 1) {
      throw new CliUsageError(`${name} may only be provided once.`)
    }
    if (positions.length === 0) {
      return undefined
    }

    const index = positions[0]!
    const value = this.values[index + 1]
    if (!value || value.startsWith('--')) {
      throw new CliUsageError(`${name} requires a value.`)
    }
    this.values.splice(index, 2)
    return value
  }

  done(): void {
    if (this.values.length > 0) {
      throw new CliUsageError(`Unexpected argument: ${this.values[0]}`)
    }
  }

  private positions(name: string): number[] {
    return this.values.flatMap((value, index) => value === name ? [index] : [])
  }
}

export function extractGlobalVerbose(args: readonly string[]): {
  args: string[]
  verbose: boolean
} {
  const values = [...args]
  const positions = values.flatMap((value, index) => value === '--verbose' ? [index] : [])
  if (positions.length > 1) {
    throw new CliUsageError('--verbose may only be provided once.')
  }
  if (positions.length === 1) {
    values.splice(positions[0]!, 1)
  }
  return { args: values, verbose: positions.length === 1 }
}
