import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createCliApplication,
  runBitveinsCli,
} from '../../cli/composition-root'
import { CliExitCode } from '../../cli/core/cli-error'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('CLI composition root', () => {
  it('wires the complete command registry around the packaged release', async () => {
    vi.stubEnv('BITVEINS_RELEASE_ROOT', '/opt/bitveins/release')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(
      () => true,
    )

    await expect(createCliApplication('1.2.3').run(['help'])).resolves.toBe(
      CliExitCode.Success,
    )

    expect(stdout).toHaveBeenCalled()
    expect(String(stdout.mock.calls[0]?.[0])).toContain('bitveins install')
  })

  it('uses the default bundle location and forwards arguments', async () => {
    vi.stubEnv('BITVEINS_RELEASE_ROOT', '')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(
      () => true,
    )

    await expect(runBitveinsCli(['version'], '1.2.3')).resolves.toBe(
      CliExitCode.Success,
    )
    expect(stdout).toHaveBeenCalledWith('1.2.3\n')
  })
})
