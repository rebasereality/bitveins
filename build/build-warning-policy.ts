export interface BuildWarning {
  id?: string
  message: string
  plugin?: string
}

type BuildWarningReporter = (warning: BuildWarning) => void

const SOURCEMAP_WARNING_PLUGINS = new Set([
  '@tailwindcss/vite:generate:build',
  'nuxt:module-preload-polyfill',
])

export function isKnownUpstreamBuildWarning(warning: BuildWarning): boolean {
  if (
    warning.message.includes('Sourcemap is likely to be incorrect')
    && warning.plugin
    && SOURCEMAP_WARNING_PLUGINS.has(warning.plugin)
  ) {
    return true
  }

  return Boolean(
    warning.id?.includes('/@vueuse/core/')
    && warning.message.includes('contains an annotation that Rollup cannot interpret'),
  )
}

export function reportActionableBuildWarning(
  warning: BuildWarning,
  defaultReporter: BuildWarningReporter,
): void {
  if (!isKnownUpstreamBuildWarning(warning)) {
    defaultReporter(warning)
  }
}
