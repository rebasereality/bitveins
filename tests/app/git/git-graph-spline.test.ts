import { describe, expect, it } from 'vitest'
import { gitGraphSpline } from '../../../app/git/git-graph-spline'

describe('Git graph spline', () => {
  it('keeps vertical tracks straight', () => {
    expect(gitGraphSpline(10, 0, 10, 34)).toBe('M 10 0 V 34')
  })

  it('uses a symmetric cubic with vertical tangents at both ends', () => {
    expect(gitGraphSpline(10, 0, 30, 34)).toBe('M 10 0 C 10 17, 30 17, 30 34')
    expect(gitGraphSpline(10, 17, 30, 34)).toBe('M 10 17 C 10 25.5, 30 25.5, 30 34')
  })
})
