import { describe, expect, it, vi } from 'vitest'
import {
  isKnownUpstreamBuildWarning,
  reportActionableBuildWarning,
} from '../../build/build-warning-policy'

describe('build warning policy', () => {
  it('allows only the documented Tailwind and Nuxt sourcemap warnings', () => {
    expect(isKnownUpstreamBuildWarning({
      message: 'Sourcemap is likely to be incorrect',
      plugin: '@tailwindcss/vite:generate:build',
    })).toBe(true)
    expect(isKnownUpstreamBuildWarning({
      message: 'Sourcemap is likely to be incorrect',
      plugin: 'nuxt:module-preload-polyfill',
    })).toBe(true)
    expect(isKnownUpstreamBuildWarning({
      message: 'Sourcemap is likely to be incorrect',
      plugin: 'bitveins',
    })).toBe(false)
  })

  it('allows the known VueUse PURE annotation warning by exact package', () => {
    expect(isKnownUpstreamBuildWarning({
      id: '/node_modules/@vueuse/core/dist/index.js',
      message: 'contains an annotation that Rollup cannot interpret',
    })).toBe(true)
    expect(isKnownUpstreamBuildWarning({
      id: '/app/terminal/controller.ts',
      message: 'contains an annotation that Rollup cannot interpret',
    })).toBe(false)
  })

  it('forwards every warning outside the allowlist', () => {
    const reporter = vi.fn()
    const actionable = {
      message: 'Circular dependency detected',
      plugin: 'bitveins',
    }

    reportActionableBuildWarning(actionable, reporter)
    reportActionableBuildWarning({
      message: 'Sourcemap is likely to be incorrect',
      plugin: '@tailwindcss/vite:generate:build',
    }, reporter)

    expect(reporter).toHaveBeenCalledOnce()
    expect(reporter).toHaveBeenCalledWith(actionable)
  })
})
