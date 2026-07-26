import { describe, expect, it } from 'vitest'
import {
  normalizeLicenseReport,
  parseLicenseEntries,
} from '../../../scripts/release/license-report'

const validReport = {
  MIT: [{
    license: 'MIT',
    name: 'z-package',
    paths: ['/private/build/path'],
    versions: ['1.0.0'],
  }],
  Unknown: [{
    license: 'Unknown',
    name: 'a-package',
    versions: ['2.0.0'],
  }],
}

describe('release license report', () => {
  it('validates, overrides and sorts pnpm license entries', () => {
    expect(parseLicenseEntries(validReport)).toHaveLength(2)
    expect(normalizeLicenseReport(validReport, {
      'a-package': {
        license: 'Apache-2.0',
        source: 'https://example.test/license',
      },
    })).toEqual([
      {
        author: undefined,
        description: undefined,
        homepage: undefined,
        license: 'Apache-2.0',
        licenseSource: 'https://example.test/license',
        name: 'a-package',
        versions: ['2.0.0'],
      },
      {
        author: undefined,
        description: undefined,
        homepage: undefined,
        license: 'MIT',
        licenseSource: undefined,
        name: 'z-package',
        versions: ['1.0.0'],
      },
    ])
    expect(JSON.stringify(normalizeLicenseReport(validReport, {
      'a-package': {
        license: 'Apache-2.0',
        source: 'https://example.test/license',
      },
    }))).not.toContain('/private/build/path')
  })

  it('rejects malformed reports and unresolved licenses', () => {
    expect(() => parseLicenseEntries([])).toThrow(/invalid license report/)
    expect(() => parseLicenseEntries({
      MIT: [{ license: 'MIT', name: 'package', versions: [1] }],
    })).toThrow(/invalid license entry/)
    expect(() => normalizeLicenseReport(validReport, {})).toThrow(
      /no reviewable license metadata/,
    )
  })
})
