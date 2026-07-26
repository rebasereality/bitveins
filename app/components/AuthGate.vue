<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/contracts/auth'

type AuthState = 'checking' | 'locked' | 'unlocked'

const TerminalApplication = defineAsyncComponent(() => import('~/components/AsyncTerminalApp.vue'))
const state = ref<AuthState>('checking')
const linuxUsername = ref<string | null>(null)
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

function isAuthError(authError: unknown): boolean {
  return typeof authError === 'object'
    && authError !== null
    && 'statusCode' in authError
    && (authError as { statusCode?: unknown }).statusCode === 401
}

async function refreshSession(): Promise<void> {
  try {
    const session = await $fetch<AuthSessionResponse>('/api/auth/session')
    state.value = session.authenticated ? 'unlocked' : 'locked'
    linuxUsername.value = session.authenticated ? session.linuxUsername : null
  }
  catch {
    state.value = 'locked'
    linuxUsername.value = null
  }
}

async function unlock(): Promise<void> {
  if (!password.value || loading.value) {
    return
  }

  loading.value = true
  error.value = null

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        password: password.value,
      },
    })
    password.value = ''
    await refreshSession()
  }
  catch (unlockError) {
    error.value = isAuthError(unlockError) ? 'Invalid passphrase.' : 'Unable to unlock Bitveins.'
  }
  finally {
    loading.value = false
  }
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', {
    method: 'POST',
  }).catch(() => {})
  state.value = 'locked'
  linuxUsername.value = null
}

function lock(): void {
  state.value = 'locked'
  linuxUsername.value = null
}

onMounted(() => {
  void refreshSession()
})
</script>

<template>
  <div
    v-if="state === 'checking'"
    class="grid h-screen w-screen place-items-center bg-[var(--bitveins-shell-bg)] text-[var(--bitveins-shell-text-muted)]"
  >
    <UIcon
      class="size-6 animate-spin text-[var(--bitveins-shell-accent)]"
      name="i-lucide-loader-circle"
    />
  </div>

  <TerminalApplication
    v-else-if="state === 'unlocked'"
    :linux-username="linuxUsername"
    @auth-expired="lock"
    @logout="logout"
  />

  <main
    v-else
    class="grid h-screen w-screen place-items-center overflow-hidden bg-[var(--bitveins-shell-bg)] px-4 text-[var(--bitveins-shell-text)]"
  >
    <form
      class="w-full max-w-sm space-y-4 rounded-lg border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] p-5 shadow-2xl shadow-black/20"
      @submit.prevent="unlock"
    >
      <div class="space-y-1">
        <p class="text-xs uppercase tracking-[0.24em] text-[var(--bitveins-shell-accent)]">
          Bitveins
        </p>
        <h1 class="text-lg font-semibold text-[var(--bitveins-shell-text)]">
          Unlock terminal
        </h1>
      </div>

      <UAlert
        v-if="error"
        color="error"
        icon="i-lucide-triangle-alert"
        :title="error"
        variant="subtle"
      />

      <UFormField label="Passphrase">
        <UInput
          v-model="password"
          autocomplete="current-password"
          autofocus
          class="w-full"
          :disabled="loading"
          type="password"
        />
      </UFormField>

      <UButton
        block
        color="primary"
        :disabled="!password"
        icon="i-lucide-lock-keyhole-open"
        label="Unlock"
        :loading="loading"
        type="submit"
      />
    </form>
  </main>
</template>
