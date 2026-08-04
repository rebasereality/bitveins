<script setup lang="ts">
import type { HermesNotificationPreference } from '#shared/contracts/attention'

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
  busy: hermesBusy,
  error: hermesError,
  preference: hermesPreference,
  setPreference: setHermesPreference,
} = useHermesNotificationPreferences()

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
    description: 'When a parent turn finishes with a text response and no tool use. Off by default.',
    key: 'completedWithoutTools',
    label: 'Text-only responses',
  },
  {
    description: 'When a parent turn stops because of an error.',
    key: 'failed',
    label: 'Failed turns',
  },
]

function updateHermesPreference(
  key: keyof HermesNotificationPreference,
  value: boolean,
): void {
  void setHermesPreference(key, value)
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

    <UAlert
      v-if="hermesError"
      class="mt-3"
      color="error"
      :title="hermesError"
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
          Off by default. When enabled, notifications may include a shortened event summary.
        </p>
      </div>
      <USwitch
        aria-label="Show event details in system notifications"
        :disabled="busy"
        :model-value="showDetails"
        @update:model-value="setShowDetails"
      />
    </div>

    <div class="mt-5 border-t border-[var(--bitveins-shell-border)] pt-5">
      <div>
        <p class="text-sm font-medium">
          Hermes lifecycle events
        </p>
        <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
          Choose which Hermes parent-turn events enter Agent Inbox and reach subscribed devices. This global setting applies to every device; “Show event details” above only affects this device. Sub-agents and intentional interruptions remain silent.
        </p>
      </div>

      <div class="mt-3 divide-y divide-[var(--bitveins-shell-border)]">
        <div
          v-for="option in hermesOptions"
          :key="option.key"
          class="flex items-center justify-between gap-5 py-3"
        >
          <div>
            <p class="text-sm">
              {{ option.label }}
            </p>
            <p class="mt-0.5 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
              {{ option.description }}
            </p>
          </div>
          <USwitch
            :aria-label="option.label"
            :disabled="hermesBusy"
            :model-value="hermesPreference[option.key]"
            @update:model-value="updateHermesPreference(option.key, $event)"
          />
        </div>
      </div>
    </div>

    <p class="mt-4 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
      iPhone and iPad require Bitveins to be installed on the Home Screen before Web Push is available. Browser-level denial must be changed in the browser or operating-system settings.
    </p>
  </section>
</template>
