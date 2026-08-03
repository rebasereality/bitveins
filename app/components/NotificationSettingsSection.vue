<script setup lang="ts">
const {
  busy,
  disable,
  enable,
  error,
  permission,
  setShowDetails,
  showDetails,
  subscribed,
  supported,
  test,
} = useWebPushNotifications()

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
        icon="i-lucide-send"
        label="Send test"
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

    <p class="mt-4 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
      iPhone and iPad require Bitveins to be installed on the Home Screen before Web Push is available. Browser-level denial must be changed in the browser or operating-system settings.
    </p>
  </section>
</template>
