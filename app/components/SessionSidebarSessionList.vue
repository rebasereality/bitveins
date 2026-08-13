<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, nextTick, ref } from 'vue'
import type { TmuxSession } from '~/types/session'
import type { TmuxAgent, TmuxAgentStatus } from '#shared/contracts/agents'

const props = defineProps<{
  activeSession: string | null
  activeAgentPaneId?: string | null
  activeWindowId?: string | null
  agents?: TmuxAgent[]
  sessions: TmuxSession[]
  isMobile?: boolean
}>()

const emit = defineEmits<{
  attach: [sessionName: string]
  detach: [sessionName: string]
  destroy: [sessionName: string]
  rename: [session: TmuxSession]
  openAgent: [agent: TmuxAgent]
  renameAgent: [payload: { label: string | null, paneId: string }]
}>()

const editingPaneId = ref<string | null>(null)
const editingLabel = ref('')
const listRoot = ref<HTMLElement | null>(null)

const agentsBySession = computed(() => {
  const grouped = new Map<string, TmuxAgent[]>()
  for (const agent of props.agents ?? []) {
    const entries = grouped.get(agent.sessionName) ?? []
    entries.push(agent)
    grouped.set(agent.sessionName, entries)
  }
  return grouped
})

const agentStatusLabels: Record<TmuxAgentStatus, string> = {
  blocked: 'Waiting for input',
  failed: 'Error',
  idle: 'Idle',
  unknown: 'Unknown',
  working: 'Working',
}

const agentKindLabels: Record<TmuxAgent['kind'], string> = {
  aider: 'Aider',
  claude: 'Claude',
  codex: 'Codex',
  copilot: 'Copilot',
  cursor: 'Cursor',
  gemini: 'Gemini',
  hermes: 'Hermes',
  opencode: 'OpenCode',
  pi: 'Pi',
}

function startAgentRename(agent: TmuxAgent): void {
  editingPaneId.value = agent.paneId
  editingLabel.value = agent.label
  void nextTick(() => {
    const input = listRoot.value?.querySelector<HTMLInputElement>('[data-agent-rename]')
    input?.focus()
    input?.select()
  })
}

function cancelAgentRename(): void {
  editingPaneId.value = null
  editingLabel.value = ''
}

function commitAgentRename(agent: TmuxAgent): void {
  const label = editingLabel.value.trim()
  if (label && label !== agent.label) emit('renameAgent', { label, paneId: agent.paneId })
  cancelAgentRename()
}

function agentGitSummary(agent: TmuxAgent): string | null {
  if (!agent.git) return null
  return [
    agent.git.repository,
    agent.git.reference,
    agent.git.detached ? 'detached HEAD' : null,
    agent.git.linkedWorktree ? 'linked worktree' : null,
  ].filter(Boolean).join(' · ')
}

function agentTitle(agent: TmuxAgent): string {
  return [
    agent.label,
    agentKindLabels[agent.kind],
    agentStatusLabels[agent.status],
    agentGitSummary(agent),
    agent.windowName,
  ].filter(Boolean).join(' — ')
}

function agentActionItems(agent: TmuxAgent): DropdownMenuItem[][] {
  return [[
    { label: 'Open agent', icon: 'i-lucide-terminal', onSelect: () => emit('openAgent', agent) },
    { label: 'Rename agent', icon: 'i-lucide-pencil', onSelect: () => startAgentRename(agent) },
    {
      label: 'Reset agent name',
      icon: 'i-lucide-rotate-ccw',
      disabled: !agent.customLabel,
      onSelect: () => emit('renameAgent', { label: null, paneId: agent.paneId }),
    },
  ]]
}

function actionItems(session: TmuxSession): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Attach',
        icon: 'i-lucide-play',
        onSelect: () => emit('attach', session.name),
      },
      {
        label: 'Detach local PTY',
        icon: 'i-lucide-square',
        disabled: props.activeSession !== session.name,
        onSelect: () => emit('detach', session.name),
      },
      {
        label: 'Rename session',
        icon: 'i-lucide-pencil',
        onSelect: () => emit('rename', session),
      },
    ],
    [
      {
        label: 'Destroy session',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => emit('destroy', session.name),
      },
    ],
  ]
}
</script>

<template>
  <div
    ref="listRoot"
    class="flex flex-col"
    data-session-list
  >
    <div
      v-for="session in sessions"
      :key="session.name"
      class="relative flex flex-col rounded-[3px] transition-colors"
      :class="activeSession === session.name ? 'session-tree-group--active' : ''"
      :data-session-group-active="activeSession === session.name"
    >
      <span
        v-if="activeSession === session.name"
        aria-hidden="true"
        class="absolute inset-y-0 left-0 z-10 w-0.5 rounded-l-[3px] bg-[var(--bitveins-shell-accent)]"
        data-session-active-rail
      />

      <div
        class="group relative flex items-center"
        :class="isMobile ? 'h-9' : 'h-6'"
        :data-session-active="activeSession === session.name"
      >
        <button
          :aria-current="activeSession === session.name ? 'true' : undefined"
          class="h-full min-w-0 flex-1 truncate rounded px-1.5 text-left text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text-muted)] outline-none transition-colors hover:bg-[var(--bitveins-shell-panel-muted)]/70 hover:text-[var(--bitveins-shell-text)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
          :class="activeSession === session.name ? 'font-semibold text-[var(--bitveins-shell-text)]' : ''"
          type="button"
          @click="emit('attach', session.name)"
        >
          {{ session.name }}
        </button>

        <UDropdownMenu
          :items="actionItems(session)"
          :content="{ align: 'end' }"
        >
          <UButton
            :aria-label="`Actions for ${session.name}`"
            class="mr-0.5 size-5 justify-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:size-7 max-lg:opacity-100"
            color="neutral"
            icon="i-lucide-ellipsis"
            size="xs"
            square
            :title="`Actions for ${session.name}`"
            variant="ghost"
          />
        </UDropdownMenu>
      </div>

      <div
        v-for="agent in agentsBySession.get(session.name) ?? []"
        :key="agent.paneId"
        class="group relative ml-2 flex items-center"
        :data-agent-active="activeAgentPaneId === agent.paneId"
        :data-agent-window-active="activeWindowId === agent.windowId"
        :data-agent-pane-id="agent.paneId"
        data-tmux-agent
        :class="[
          isMobile ? (agent.git ? 'h-12' : 'h-9') : (agent.git ? 'h-9' : 'h-6'),
          activeWindowId === agent.windowId ? 'tmux-agent-row--window-active' : '',
        ]"
      >
        <span
          aria-hidden="true"
          class="ml-1 mr-1.5 size-[var(--bitveins-agent-indicator-size)] shrink-0 rounded-[2px] border border-transparent"
          :class="`tmux-agent-state--${agent.status}`"
          data-agent-status
          :data-status="agent.status"
        />

        <input
          v-if="editingPaneId === agent.paneId"
          v-model="editingLabel"
          :aria-label="`Rename ${agent.label}`"
          class="mr-1 h-5 min-w-0 flex-1 rounded border border-[var(--bitveins-shell-accent)] bg-[var(--bitveins-shell-panel-solid)] px-1 text-[length:var(--bitveins-ui-label-size)] outline-none"
          data-agent-rename
          maxlength="80"
          @blur="commitAgentRename(agent)"
          @keydown.enter.stop.prevent="commitAgentRename(agent)"
          @keydown.esc.stop.prevent="cancelAgentRename"
        >

        <button
          v-else
          :aria-current="activeAgentPaneId === agent.paneId ? 'true' : undefined"
          :aria-label="agentTitle(agent)"
          class="flex h-full min-w-0 flex-1 overflow-hidden rounded py-0.5 pr-1 text-left text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text-muted)] outline-none transition-colors hover:bg-[var(--bitveins-shell-panel-muted)]/70 hover:text-[var(--bitveins-shell-text)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
          :class="activeAgentPaneId === agent.paneId ? 'font-semibold text-[var(--bitveins-shell-text)]' : ''"
          :title="agentTitle(agent)"
          type="button"
          @click="emit('openAgent', agent)"
          @dblclick.stop.prevent="startAgentRename(agent)"
        >
          <span
            class="flex min-w-0 flex-1 flex-col justify-center overflow-hidden"
            data-agent-identity
          >
            <span class="flex min-w-0 items-center gap-1">
              <span
                class="min-w-0 flex-1 truncate"
                data-agent-instance-name
              >{{ agent.label }}</span>
              <span
                class="ml-auto shrink-0 text-right text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]"
                data-agent-kind-name
              >{{ agentKindLabels[agent.kind] }}</span>
            </span>
            <span
              v-if="agent.git"
              class="flex min-w-0 items-center gap-1 overflow-hidden text-[length:var(--bitveins-ui-micro-size)] font-normal leading-tight text-[var(--bitveins-shell-text-subtle)] opacity-60"
              data-agent-git
              :title="agentGitSummary(agent) ?? undefined"
            >
              <UIcon
                aria-hidden="true"
                class="size-3 shrink-0"
                name="i-lucide-git-branch"
              />
              <span
                class="max-w-[42%] shrink-0 truncate"
                data-agent-git-repository
              >{{ agent.git.repository }}</span>
              <span
                aria-hidden="true"
                class="shrink-0"
              >·</span>
              <span
                class="min-w-0 flex-1 truncate"
                data-agent-git-reference
              >{{ agent.git.detached ? `@${agent.git.reference}` : agent.git.reference }}</span>
              <span
                v-if="agent.git.linkedWorktree"
                class="shrink-0"
                data-agent-git-worktree
                title="Linked Git worktree"
              >wt</span>
            </span>
          </span>
        </button>

        <UDropdownMenu
          :items="agentActionItems(agent)"
          :content="{ align: 'end' }"
        >
          <UButton
            :aria-label="`Actions for agent ${agent.label}`"
            class="mr-0.5 size-5 justify-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:size-7 max-lg:opacity-100"
            color="neutral"
            icon="i-lucide-ellipsis"
            size="xs"
            square
            :title="`Actions for agent ${agent.label}`"
            variant="ghost"
          />
        </UDropdownMenu>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tmux-agent-state--working { background: var(--bitveins-agent-working); }
.tmux-agent-state--blocked { background: var(--bitveins-agent-blocked); }
.tmux-agent-state--failed { background: var(--bitveins-agent-failed); }
.tmux-agent-state--idle { background: var(--bitveins-agent-idle); }
.tmux-agent-state--unknown { border-color: var(--bitveins-agent-idle); }
.session-tree-group--active { background: var(--bitveins-sidebar-session-active); }
.tmux-agent-row--window-active { background: var(--bitveins-sidebar-agent-active); }
</style>
