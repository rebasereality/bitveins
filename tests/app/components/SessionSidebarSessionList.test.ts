// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SessionSidebarSessionList from '../../../app/components/SessionSidebarSessionList.vue'

const ButtonStub = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

const DropdownStub = defineComponent({
  name: 'UDropdownMenu',
  template: '<div><slot /></div>',
})

describe('SessionSidebarSessionList', () => {
  it('marks the active session without changing the row geometry and attaches sessions', async () => {
    const attach = vi.fn()
    const toggleNotificationMute = vi.fn()
    const wrapper = mount(SessionSidebarSessionList, {
      props: {
        activeSession: 'Kouizine',
        hasNotificationMuteError: () => false,
        isNotificationMuteBusy: () => false,
        isNotificationMuted: sessionId => sessionId === 'qrstuvwxyzABCDEF',
        notificationMuteAvailable: true,
        sessions: [
          { id: 'abcdefghijklmnop', name: 'Dropentory', path: '/dropentory' },
          { id: 'qrstuvwxyzABCDEF', name: 'Kouizine', path: '/kouizine' },
        ],
        onAttach: attach,
        onToggleNotificationMute: toggleNotificationMute,
      },
      global: {
        components: {
          UButton: ButtonStub,
          UDropdownMenu: DropdownStub,
        },
      },
    })

    const rows = wrapper.findAll('[data-session-active]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.classes()).toContain('h-6')
    expect(rows[1]!.attributes('data-session-active')).toBe('true')
    expect(rows[1]!.find('button[aria-current="true"]').exists()).toBe(true)
    expect(wrapper.get('[data-session-group-active="true"] [data-session-active-rail]').exists()).toBe(true)

    const notificationButtons = wrapper.findAll('[data-session-notification-mute]')
    expect(notificationButtons).toHaveLength(2)
    expect(notificationButtons[0]!.attributes('aria-label')).toBe('Mute notifications for Dropentory')
    expect(notificationButtons[0]!.classes()).toContain('opacity-60')
    expect(notificationButtons[0]!.classes()).toContain('text-[var(--bitveins-shell-text-subtle)]')
    expect(notificationButtons[1]!.attributes('aria-label')).toBe('Unmute notifications for Kouizine')
    expect(notificationButtons[1]!.attributes('aria-pressed')).toBe('true')
    const sessionButtons = rows[0]!.findAll('button')
    expect(sessionButtons[1]!.attributes('data-session-notification-mute')).toBe('abcdefghijklmnop')
    expect(sessionButtons[2]!.attributes('aria-label')).toBe('Actions for Dropentory')
    await notificationButtons[0]!.trigger('click')
    expect(toggleNotificationMute).toHaveBeenCalledWith('abcdefghijklmnop')

    await rows[0]!.find('button').trigger('click')
    expect(attach).toHaveBeenCalledWith('Dropentory')
  })

  it('nests agents under their tmux session and supports opening and inline renaming', async () => {
    const openAgent = vi.fn()
    const renameAgent = vi.fn()
    const agent = {
      customLabel: 'Reviewer',
      defaultLabel: 'Bitveins',
      git: {
        detached: false,
        linkedWorktree: true,
        reference: 'feature/sidebar',
        repository: 'bitveins',
      },
      id: '%9',
      kind: 'codex' as const,
      label: 'Reviewer',
      paneId: '%9',
      paneIndex: 1,
      path: '/workspace',
      sessionId: 'abcdefghijklmnop',
      sessionName: 'main',
      status: 'blocked' as const,
      windowId: '@7',
      windowIndex: 2,
      windowName: 'work',
    }
    const wrapper = mount(SessionSidebarSessionList, {
      attachTo: document.body,
      props: {
        activeAgentPaneId: '%9',
        activeSession: 'main',
        activeWindowId: '@7',
        agents: [agent],
        sessions: [{ id: 'abcdefghijklmnop', name: 'main', path: '/workspace' }],
        onOpenAgent: openAgent,
        onRenameAgent: renameAgent,
      },
      global: {
        components: {
          UButton: ButtonStub,
          UDropdownMenu: DropdownStub,
        },
      },
    })

    const row = wrapper.get('[data-tmux-agent]')
    expect(row.attributes('data-agent-active')).toBe('true')
    expect(row.attributes('data-agent-window-active')).toBe('true')
    expect(row.classes()).toContain('tmux-agent-row--window-active')
    const activeGroup = wrapper.get('[data-session-group-active="true"]')
    expect(activeGroup.element.contains(row.element)).toBe(true)
    expect(activeGroup.find('[data-session-active-rail]').exists()).toBe(true)
    expect(row.get('[data-agent-status]').attributes('data-status')).toBe('blocked')
    expect(row.text()).toContain('Reviewer')
    expect(row.get('[data-agent-instance-name]').classes()).toContain('truncate')
    expect(row.get('[data-agent-kind-name]').classes()).toContain('shrink-0')
    expect(row.get('[data-agent-kind-name]').text()).toBe('Codex')
    expect(row.classes()).toContain('h-9')
    expect(row.get('[data-agent-git]').text()).toContain('bitveins')
    expect(row.get('[data-agent-git-reference]').text()).toBe('feature/sidebar')
    expect(row.get('[data-agent-git-worktree]').text()).toBe('wt')
    expect(row.get('[data-agent-git]').classes()).toContain('opacity-60')

    const openButton = row.get('button[aria-current="true"]')
    await openButton.trigger('click')
    expect(openAgent).toHaveBeenCalledWith(agent)

    await openButton.trigger('dblclick')
    const input = wrapper.get<HTMLInputElement>('[data-agent-rename]')
    expect(document.activeElement).toBe(input.element)
    await input.setValue('Review lead')
    await input.trigger('keydown', { key: 'Enter' })
    expect(renameAgent).toHaveBeenCalledWith({ label: 'Review lead', paneId: '%9' })
    wrapper.unmount()
  })
})
