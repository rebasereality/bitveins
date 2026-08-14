<script setup lang="ts">
import type {
  AntigravityNotificationPreference,
  CodexNotificationPreference,
  HermesNotificationPreference,
} from '#shared/contracts/attention'

const {
  busy,
  disable,
  enable,
  error,
  localTest,
  permission,
  setShowDetails,
  showDetails,
  subscribed,
  supported,
  test,
} = useWebPushNotifications()

const {
  busy: antigravityBusy,
  error: antigravityError,
  preference: antigravityPreference,
  setPreference: setAntigravityPreference,
} = useAntigravityNotificationPreferences()

const {
  busy: codexBusy,
  error: codexError,
  preference: codexPreference,
  setPreference: setCodexPreference,
} = useCodexNotificationPreferences()

const {
  busy: hermesBusy,
  error: hermesError,
  preference: hermesPreference,
  setPreference: setHermesPreference,
} = useHermesNotificationPreferences()

const antigravityOptions: Array<{
  description: string
  key: keyof AntigravityNotificationPreference
  label: string
}> = [
  {
    description: 'When Antigravity is waiting for an answer to a clarification or user input.',
    key: 'inputRequired',
    label: 'Input requests',
  },
  {
    description: 'When a tool or protected action requires your approval.',
    key: 'permissionRequired',
    label: 'Permission requests',
  },
  {
    description: 'When Antigravity finishes a turn after using one or more tools.',
    key: 'completedWithTools',
    label: 'Completed tool turns',
  },
  {
    description: 'When Antigravity finishes with a text response and no tool use.',
    key: 'completedWithoutTools',
    label: 'Text-only responses',
  },
  {
    description: 'When Antigravity stops because of an error.',
    key: 'failed',
    label: 'Failed turns',
  },
]

const codexOptions: Array<{
  description: string
  key: keyof CodexNotificationPreference
  label: string
}> = [
  {
    description: 'When Codex asks for approval before a protected action.',
    key: 'permissionRequired',
    label: 'Codex permission requests',
  },
  {
    description: 'When a parent Codex turn finishes after an observable local tool call.',
    key: 'completedWithTools',
    label: 'Codex completed tool turns',
  },
  {
    description: 'When a parent Codex turn finishes without an observable local tool call.',
    key: 'completedWithoutTools',
    label: 'Codex text-only responses',
  },
]

const hermesOptions: Array<{
  description: string
  key: keyof HermesNotificationPreference
  label: string
}> = [
  {
    description: 'When Hermes is waiting for an answer to a clarification.',
    key: 'inputRequired',
    label: 'Input requests',
  },
  {
    description: 'When a manual action requires your approval.',
    key: 'permissionRequired',
    label: 'Permission requests',
  },
  {
    description: 'When a parent turn finishes after using one or more tools.',
    key: 'completedWithTools',
    label: 'Completed tool turns',
  },
  {
    description: 'When a parent turn finishes with a text response and no tool use.',
    key: 'completedWithoutTools',
    label: 'Text-only responses',
  },
  {
    description: 'When a parent turn stops because of an error.',
    key: 'failed',
    label: 'Failed turns',
  },
]

function updateAntigravityPreference(
  key: keyof AntigravityNotificationPreference,
  value: boolean,
): void {
  void setAntigravityPreference(key, value)
}

function updateHermesPreference(
  key: keyof HermesNotificationPreference,
  value: boolean,
): void {
  void setHermesPreference(key, value)
}

function updateCodexPreference(
  key: keyof CodexNotificationPreference,
  value: boolean,
): void {
  void setCodexPreference(key, value)
}

const status = computed(() => {
  if (!supported.value) return 'Not supported by this browser'
  if (permission.value === 'denied') return 'Blocked in browser settings'
  if (subscribed.value) return 'Enabled for this device'
  return `Permission: ${permission.value}`
})
</script>

<template>
  <section
    class="border-t border-[var(--bitveins-shell-border)] py-6"
    data-notification-settings
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-medium">
          Agent Inbox notifications
        </h2>
        <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
          Receive attention, completion and failure alerts while Bitveins is closed. Permission is requested only when you enable notifications.
        </p>
      </div>
      <span class="rounded border border-[var(--bitveins-shell-border)] px-2 py-1 text-xs text-[var(--bitveins-shell-text-muted)]">
        {{ status }}
      </span>
    </div>

    <UAlert
      v-if="error"
      class="mt-3"
      color="error"
      :title="error"
      variant="subtle"
    />

    <div class="mt-4 flex flex-wrap gap-2">
      <UButton
        v-if="!subscribed"
        color="primary"
        :disabled="busy || !supported || permission === 'denied'"
        icon="i-lucide-bell-ring"
        label="Enable notifications"
        size="sm"
        @click="void enable()"
      />
      <UButton
        v-else
        color="neutral"
        :disabled="busy"
        icon="i-lucide-bell-off"
        label="Disable on this device"
        size="sm"
        variant="outline"
        @click="disable"
      />
      <UButton
        color="neutral"
        :disabled="busy || !subscribed"
        icon="i-lucide-smartphone"
        label="Test device display"
        size="sm"
        variant="outline"
        @click="localTest"
      />
      <UButton
        color="neutral"
        :disabled="busy || !subscribed"
        icon="i-lucide-send"
        label="Test Web Push"
        size="sm"
        variant="outline"
        @click="test"
      />
    </div>

    <div class="mt-5 flex items-center justify-between gap-5 border-t border-[var(--bitveins-shell-border)] pt-5">
      <div>
        <p class="text-sm font-medium">
          Show event details in system notifications
        </p>
        <p class="mt-1 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
          Notifications include session and tmux window context, and may include a shortened event summary when enabled.
        </p>
      </div>
      <USwitch
        aria-label="Show event details in system notifications"
        :disabled="busy"
        :model-value="showDetails"
        @update:model-value="setShowDetails"
      />
    </div>

    <div class="mt-6 border-t border-[var(--bitveins-shell-border)] pt-5">
      <div>
        <h3 class="text-sm font-medium">
          Agent integrations
        </h3>
        <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
          Configure which lifecycle events each connected agent sends to Agent Inbox and subscribed devices.
        </p>
      </div>

      <AgentNotificationSettingsGroup
        agent="antigravity"
        class="mt-4"
        description="Choose which Antigravity lifecycle events enter Agent Inbox and reach subscribed devices. These settings apply across devices. Sub-agents and intentional interruptions stay silent."
        icon="i-lucide-sparkles"
        title="Antigravity Agent"
      >
        <div
          v-if="antigravityError"
          class="border-b border-[var(--bitveins-shell-border)] py-3"
        >
          <UAlert
            color="error"
            :title="antigravityError"
            variant="subtle"
          />
        </div>

        <div class="divide-y divide-[var(--bitveins-shell-border)]">
          <div
            v-for="option in antigravityOptions"
            :key="option.key"
            class="flex items-start justify-between gap-4 py-3 sm:items-center sm:gap-6"
            data-agent-notification-option
          >
            <div
              class="min-w-0 flex-1"
              data-agent-notification-copy
            >
              <p class="text-sm">
                {{ option.label }}
              </p>
              <p class="mt-0.5 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
                {{ option.description }}
              </p>
            </div>
            <USwitch
              class="mt-0.5 shrink-0 sm:mt-0"
              :aria-label="option.label"
              :disabled="antigravityBusy"
              :model-value="antigravityPreference[option.key]"
              @update:model-value="updateAntigravityPreference(option.key, $event)"
            />
          </div>
        </div>
      </AgentNotificationSettingsGroup>

      <AgentNotificationSettingsGroup
        agent="codex"
        class="mt-4"
        description="Choose which lifecycle events Codex sends to Agent Inbox and subscribed devices. Codex currently exposes permission requests and turn completion; it does not expose reliable clarification or failure events."
        logo-src="/icons/codex.png"
        title="Codex"
      >
        <div
          v-if="codexError"
          class="border-b border-[var(--bitveins-shell-border)] py-3"
        >
          <UAlert
            color="error"
            :title="codexError"
            variant="subtle"
          />
        </div>

        <div class="divide-y divide-[var(--bitveins-shell-border)]">
          <div
            v-for="option in codexOptions"
            :key="option.key"
            class="flex items-start justify-between gap-4 py-3 sm:items-center sm:gap-6"
            data-agent-notification-option
          >
            <div
              class="min-w-0 flex-1"
              data-agent-notification-copy
            >
              <p class="text-sm">
                {{ option.label }}
              </p>
              <p class="mt-0.5 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
                {{ option.description }}
              </p>
            </div>
            <USwitch
              class="mt-0.5 shrink-0 sm:mt-0"
              :aria-label="option.label"
              :disabled="codexBusy"
              :model-value="codexPreference[option.key]"
              @update:model-value="updateCodexPreference(option.key, $event)"
            />
          </div>
        </div>
      </AgentNotificationSettingsGroup>

      <AgentNotificationSettingsGroup
        agent="hermes"
        class="mt-4"
        description="Choose which Hermes lifecycle events enter Agent Inbox and reach subscribed devices. These settings apply across devices. Sub-agents and intentional interruptions stay silent."
        logo-src="/icons/hermes-agent.png"
        title="Hermes Agent"
      >
        <div
          v-if="hermesError"
          class="border-b border-[var(--bitveins-shell-border)] py-3"
        >
          <UAlert
            color="error"
            :title="hermesError"
            variant="subtle"
          />
        </div>

        <div class="divide-y divide-[var(--bitveins-shell-border)]">
          <div
            v-for="option in hermesOptions"
            :key="option.key"
            class="flex items-start justify-between gap-4 py-3 sm:items-center sm:gap-6"
            data-agent-notification-option
          >
            <div
              class="min-w-0 flex-1"
              data-agent-notification-copy
            >
              <p class="text-sm">
                {{ option.label }}
              </p>
              <p class="mt-0.5 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
                {{ option.description }}
              </p>
            </div>
            <USwitch
              class="mt-0.5 shrink-0 sm:mt-0"
              :aria-label="option.label"
              :disabled="hermesBusy"
              :model-value="hermesPreference[option.key]"
              @update:model-value="updateHermesPreference(option.key, $event)"
            />
          </div>
        </div>
      </AgentNotificationSettingsGroup>
    </div>

    <p class="mt-4 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
      iPhone and iPad require Bitveins to be installed on the Home Screen before Web Push is available. Browser-level denial must be changed in the browser or operating-system settings.
    </p>
  </section>
</template>
