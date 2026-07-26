import { describe, expect, it } from 'vitest'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'

describe('installation layout', () => {
  it('uses XDG locations and an overridable executable directory', () => {
    const layout = resolveInstallationLayout({
      HOME: '/home/alice',
      BITVEINS_BIN_DIR: '/opt/alice/bin',
      XDG_CONFIG_HOME: '/config',
      XDG_DATA_HOME: '/data',
      XDG_STATE_HOME: '/state',
    })

    expect(layout.commandPath).toBe('/opt/alice/bin/bitveins')
    expect(layout.environmentFile).toBe('/config/bitveins/env')
    expect(layout.dataDirectory).toBe('/data/bitveins')
    expect(layout.lockFile).toBe('/state/bitveins/operation.lock')
    expect(layout.currentReleaseLink).toBe('/home/alice/.local/lib/bitveins/current')
  })

  it('rejects relative directory overrides', () => {
    expect(() => resolveInstallationLayout({
      HOME: '/home/alice',
      XDG_CONFIG_HOME: '../config',
    })).toThrow(/XDG_CONFIG_HOME must be an absolute path/)
  })
})
