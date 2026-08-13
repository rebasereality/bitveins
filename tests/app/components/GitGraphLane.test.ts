// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GitGraphLane from '../../../app/components/GitGraphLane.vue'

describe('GitGraphLane', () => {
  it('draws through lines, outgoing parents, and the commit node', () => {
    const wrapper = mount(GitGraphLane, {
      props: {
        row: {
          color: 0,
          commit: {
            hash: 'a'.repeat(40),
            shortHash: 'aaaaaaaa',
            parents: ['b'.repeat(40), 'c'.repeat(40)],
            subject: 'Merge',
            authorName: 'Test',
            authorEmail: 'test@example.test',
            authoredAt: '2026-01-01T00:00:00Z',
            references: [],
          },
          lane: 1,
          laneCount: 3,
          segments: [
            { color: 1, from: 0, kind: 'through', to: 0 },
            { color: 0, from: 1, kind: 'outgoing', to: 1 },
            { color: 2, from: 1, kind: 'outgoing', to: 2 },
          ],
        },
      },
    })

    const paths = wrapper.findAll('path')
    expect(paths).toHaveLength(3)
    expect(paths[0]?.attributes('d')).toBe('M 10 0 V 34')
    expect(paths[1]?.attributes('d')).toBe('M 30 17 V 34')
    expect(paths[2]?.attributes('d')).toBe('M 30 17 L 50 34')
    expect(paths.every(path => !path.attributes('d')?.includes('C'))).toBe(true)
    expect(wrapper.find('circle').attributes('stroke')).toBe('var(--bitveins-git-0)')
    expect(wrapper.attributes('aria-label')).toBe('Commit graph lane 2')
  })
})
