import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PasswordFileReader,
  TerminalPasswordReader,
  TtyPasswordInput,
} from '../../../cli/platform/terminal-password-reader'
import { MAX_BITVEINS_PASSWORD_LENGTH } from '../../../shared/security/password-hasher'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('PasswordFileReader', () => {
  it('reads a private password file without retaining its trailing newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-password-file-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'password')
    await writeFile(path, 'secure passphrase\n', { mode: 0o600 })

    await expect(new PasswordFileReader(path).readNewPassword())
      .resolves.toBe('secure passphrase')
  })

  it('rejects password files visible to other users', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-password-mode-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'password')
    await writeFile(path, 'secure passphrase\n')
    await chmod(path, 0o644)

    await expect(new PasswordFileReader(path).readNewPassword())
      .rejects.toThrow(/must not be readable/)
  })

  it('rejects oversized password files before reading their contents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-password-size-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'password')
    await writeFile(path, 'x'.repeat(MAX_BITVEINS_PASSWORD_LENGTH + 3), {
      mode: 0o600,
    })

    await expect(new PasswordFileReader(path).readNewPassword())
      .rejects.toThrow(/too large/)
  })
})

describe('TerminalPasswordReader', () => {
  it('requires the password confirmation to match', async () => {
    const responses = ['a secure passphrase', 'a different passphrase']
    const reader = new TerminalPasswordReader({
      read: async () => responses.shift() || '',
    })

    await expect(reader.readNewPassword()).rejects.toThrow(/does not match/)
  })

  it('returns the confirmed password without logging it', async () => {
    const responses = ['a secure passphrase', 'a secure passphrase']
    const reader = new TerminalPasswordReader({
      read: async () => responses.shift() || '',
    })

    await expect(reader.readNewPassword()).resolves.toBe('a secure passphrase')
  })
})

class FakeRawInput extends EventEmitter {
  destroyed = false
  encoding: BufferEncoding | null = null
  isRaw = false
  resumed = false

  destroy(): void {
    this.destroyed = true
  }

  resume(): this {
    this.resumed = true
    return this
  }

  setEncoding(encoding: BufferEncoding): void {
    this.encoding = encoding
  }

  setRawMode(enabled: boolean): void {
    this.isRaw = enabled
  }
}

class FakeRawOutput {
  ended = false
  values: string[] = []

  end(): void {
    this.ended = true
  }

  write(value: string): boolean {
    this.values.push(value)
    return true
  }
}

function ttyInputFixture() {
  const input = new FakeRawInput()
  const output = new FakeRawOutput()
  const reader = new TtyPasswordInput(() => ({ input, output }))
  return { input, output, reader }
}

describe('TtyPasswordInput', () => {
  it('collects printable characters, backspace and newline without echoing', async () => {
    const fixture = ttyInputFixture()
    const reading = fixture.reader.read('Password: ')

    fixture.input.emit('data', `ab\u007fc\u0001\n`)

    await expect(reading).resolves.toBe('ac')
    expect(fixture.output.values).toEqual(['Password: ', '\n'])
    expect(fixture.input.encoding).toBe('utf8')
    expect(fixture.input.resumed).toBe(true)
    expect(fixture.input.destroyed).toBe(true)
    expect(fixture.output.ended).toBe(true)
    expect(fixture.input.isRaw).toBe(false)
  })

  it('accepts carriage return and backspace control variants', async () => {
    const fixture = ttyInputFixture()
    const reading = fixture.reader.read('Password: ')

    fixture.input.emit('data', `ab\bc\r`)

    await expect(reading).resolves.toBe('ac')
  })

  it('cleans up on cancellation and stream errors', async () => {
    const cancelled = ttyInputFixture()
    const cancelledReading = cancelled.reader.read('Password: ')
    cancelled.input.emit('data', '\u0003')
    await expect(cancelledReading).rejects.toThrow(/cancelled/)

    const failed = ttyInputFixture()
    const failedReading = failed.reader.read('Password: ')
    failed.input.emit('error', new Error('TTY failed'))
    await expect(failedReading).rejects.toThrow(/TTY failed/)
  })

  it('rejects input exceeding the password length bound', async () => {
    const fixture = ttyInputFixture()
    const reading = fixture.reader.read('Password: ')

    fixture.input.emit(
      'data',
      'x'.repeat(MAX_BITVEINS_PASSWORD_LENGTH + 1),
    )

    await expect(reading).rejects.toThrow(/too long/)
  })
})
