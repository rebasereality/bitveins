// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { isDocumentHidden } from '../../../app/terminal/document-visibility'

describe('document visibility', () => {
  it('treats a hidden document as a background Bitveins tab', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    expect(isDocumentHidden()).toBe(true)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    expect(isDocumentHidden()).toBe(false)
  })
})
