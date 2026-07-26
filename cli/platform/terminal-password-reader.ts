import { openSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import {
  ReadStream,
  WriteStream,
} from 'node:tty'
import { readPrivateFile } from './secure-filesystem'
import type { PasswordReader } from '../ports/password-reader'
import { MAX_BITVEINS_PASSWORD_LENGTH } from '../../shared/security/password-hasher'

interface PasswordInput {
  read(prompt: string): Promise<string>
}

interface RawPasswordInput {
  readonly isRaw: boolean
  destroy(): void
  on(event: 'data', listener: (chunk: unknown) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  resume(): void
  setEncoding(encoding: BufferEncoding): void
  setRawMode(enabled: boolean): void
}

interface RawPasswordOutput {
  end(): void
  write(value: string): unknown
}

interface TtyPasswordStreams {
  input: RawPasswordInput
  output: RawPasswordOutput
}

function openTtyPasswordStreams(): TtyPasswordStreams {
  return {
    input: new ReadStream(openSync('/dev/tty', 'r')),
    output: new WriteStream(openSync('/dev/tty', 'w')),
  }
}

export class TtyPasswordInput implements PasswordInput {
  constructor(
    private readonly openStreams: () => TtyPasswordStreams
      = openTtyPasswordStreams,
  ) {}

  async read(prompt: string): Promise<string> {
    const { input, output } = this.openStreams()

    return await new Promise<string>((resolve, reject) => {
      let value = ''
      const cleanup = () => {
        if (input.isRaw) {
          input.setRawMode(false)
        }
        input.destroy()
        output.end()
      }

      output.write(prompt)
      input.setEncoding('utf8')
      input.setRawMode(true)
      input.resume()
      input.on('error', (error) => {
        cleanup()
        reject(error)
      })
      input.on('data', (chunk) => {
        for (const character of String(chunk)) {
          if (character === '\u0003') {
            output.write('\n')
            cleanup()
            reject(new Error('Password entry cancelled.'))
            return
          }

          if (character === '\r' || character === '\n') {
            output.write('\n')
            cleanup()
            resolve(value)
            return
          }

          if (character === '\u007f' || character === '\b') {
            value = value.slice(0, -1)
            continue
          }

          if (character >= ' ') {
            value += character
            if (value.length > MAX_BITVEINS_PASSWORD_LENGTH) {
              cleanup()
              reject(new Error('The Bitveins password is too long.'))
              return
            }
          }
        }
      })
    })
  }
}

export class TerminalPasswordReader implements PasswordReader {
  constructor(private readonly input: PasswordInput = new TtyPasswordInput()) {}

  async readNewPassword(): Promise<string> {
    const password = await this.input.read('Bitveins password: ')
    const confirmation = await this.input.read('Confirm Bitveins password: ')

    if (password !== confirmation) {
      throw new Error('The Bitveins password confirmation does not match.')
    }

    return password
  }
}

export class PasswordFileReader implements PasswordReader {
  constructor(private readonly path: string) {}

  async readNewPassword(): Promise<string> {
    if ((await stat(this.path)).size > MAX_BITVEINS_PASSWORD_LENGTH + 2) {
      throw new Error('The Bitveins password file is too large.')
    }
    const value = await readPrivateFile(this.path)
    return value.replace(/\r?\n$/u, '')
  }
}
