interface LicenseEntry {
  author?: string
  description?: string
  homepage?: string
  license: string
  name: string
  versions: string[]
}

export interface LicenseOverride {
  license: string
  source: string
}

export interface ThirdPartyPackage extends LicenseEntry {
  licenseSource?: string
}

export function parseLicenseEntries(value: unknown): LicenseEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('pnpm returned an invalid license report.')
  }

  return Object.values(value)
    .flatMap(group => Array.isArray(group) ? group : [])
    .map((entry) => {
      const candidate = entry as Partial<Record<keyof LicenseEntry, unknown>>
      if (
        !entry
        || typeof entry !== 'object'
        || typeof candidate.name !== 'string'
        || typeof candidate.license !== 'string'
        || !Array.isArray(candidate.versions)
        || !candidate.versions.every(version => typeof version === 'string')
      ) {
        throw new Error('pnpm returned an invalid license entry.')
      }
      return candidate as LicenseEntry
    })
}

export function normalizeLicenseReport(
  value: unknown,
  overrides: Readonly<Record<string, LicenseOverride | undefined>>,
): ThirdPartyPackage[] {
  return parseLicenseEntries(value)
    .map((entry) => {
      const override = overrides[entry.name]
      const license = entry.license === 'Unknown' && override
        ? override.license
        : entry.license
      if (!license || license === 'Unknown') {
        throw new Error(
          `Dependency ${entry.name} has no reviewable license metadata.`,
        )
      }

      return {
        author: entry.author,
        description: entry.description,
        homepage: entry.homepage,
        license,
        licenseSource: override?.source,
        name: entry.name,
        versions: entry.versions,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}
