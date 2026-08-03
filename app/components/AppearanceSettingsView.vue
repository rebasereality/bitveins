<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import {
  INPUT_LINE_HEIGHTS,
  INPUT_MIN_HEIGHTS,
  type AppearanceScale,
} from '~/utils/appearance-settings'

const props = defineProps<{
  username: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const colorMode = useColorMode()
const {
  accentColor,
  activeDevice,
  settings,
  inputFontSize,
  interfaceFontSize,
  promptMonospace,
  terminalFontSize,
  setAccentColor,
  setPromptMonospace,
  setScale,
  reset,
} = useAppearanceSettings()
const deviceLabel = computed(() => activeDevice.value === 'mobile' ? 'Mobile' : 'Desktop')
const deviceIcon = computed(() => activeDevice.value === 'mobile' ? 'i-lucide-smartphone' : 'i-lucide-monitor')

const themes = [
  { icon: 'i-lucide-monitor', label: 'System', value: 'system' },
  { icon: 'i-lucide-sun', label: 'Light', value: 'light' },
  { icon: 'i-lucide-moon', label: 'Dark', value: 'dark' },
] as const

function updateScale(
  key: 'interfaceScale' | 'terminalScale' | 'inputScale',
  value: AppearanceScale,
): void {
  setScale(key, value)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="grid h-full min-h-0 w-full grid-cols-[196px_minmax(0,1fr)] overflow-hidden bg-[var(--bitveins-shell-bg)] text-[var(--bitveins-shell-text)] max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]"
    data-settings-view
    role="region"
    aria-label="Settings"
  >
    <aside class="flex justify-end border-r border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] px-2 py-6 max-md:block max-md:border-b max-md:border-r-0 max-md:py-2 max-md:pl-3 max-md:pr-12">
      <div class="w-40 max-md:flex max-md:w-full max-md:items-center max-md:gap-2">
        <div class="px-2 pb-2 max-md:min-w-0 max-md:flex-1 max-md:pb-0">
          <p class="truncate text-[length:var(--bitveins-ui-micro-size)] font-semibold uppercase tracking-wider text-[var(--bitveins-shell-text-subtle)]">
            User settings
          </p>
          <p class="mt-0.5 truncate text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text-muted)]">
            {{ props.username || 'Linux user' }}
          </p>
        </div>

        <button
          aria-current="page"
          class="flex h-8 w-full items-center gap-2 rounded bg-[var(--bitveins-shell-accent-soft)] px-2 text-left font-medium text-[var(--bitveins-shell-text)] max-md:w-auto"
          type="button"
        >
          <UIcon
            class="size-4 text-[var(--bitveins-shell-accent)]"
            name="i-lucide-palette"
          />
          <span>Appearance</span>
        </button>
      </div>
    </aside>

    <div class="relative min-h-0 overflow-y-auto">
      <button
        aria-label="Close settings"
        class="absolute right-5 top-5 z-10 grid size-8 place-items-center rounded-full border border-[var(--bitveins-shell-border-strong)] text-[var(--bitveins-shell-text-muted)] transition-colors hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)] max-md:right-2 max-md:top-2"
        title="Close settings (Esc)"
        type="button"
        @click="emit('close')"
      >
        <UIcon
          class="size-4"
          name="i-lucide-x"
        />
      </button>

      <div class="mx-auto w-full max-w-3xl px-10 py-8 max-md:px-4 max-md:py-5">
        <div class="pr-12">
          <div class="flex items-center gap-2">
            <h2 class="text-[length:var(--bitveins-ui-heading-size)] font-semibold">
              Appearance
            </h2>
            <span
              class="inline-flex h-6 items-center gap-1.5 rounded border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] px-2 text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)]"
              data-appearance-device
            >
              <UIcon
                class="size-3.5"
                :name="deviceIcon"
              />
              {{ deviceLabel }}
            </span>
          </div>
          <p class="mt-1 text-xs text-[var(--bitveins-shell-text-muted)]">
            Fine-tune this device profile. Desktop and mobile sizes are saved independently and apply instantly.
          </p>
        </div>

        <section class="py-6">
          <h3 class="font-semibold">
            Theme
          </h3>
          <p class="mt-1 text-xs text-[var(--bitveins-shell-text-muted)]">
            Use your system preference or force a light or dark appearance.
          </p>
          <div class="mt-3 grid max-w-md grid-cols-3 gap-2">
            <button
              v-for="theme in themes"
              :key="theme.value"
              :aria-pressed="colorMode.preference === theme.value"
              class="flex h-9 items-center justify-center gap-2 rounded-md border px-3 transition-colors"
              :class="colorMode.preference === theme.value
                ? 'border-[var(--bitveins-shell-accent)] bg-[var(--bitveins-shell-accent-soft)] text-[var(--bitveins-shell-text)]'
                : 'border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] text-[var(--bitveins-shell-text-muted)] hover:border-[var(--bitveins-shell-border-strong)] hover:text-[var(--bitveins-shell-text)]'"
              type="button"
              @click="colorMode.preference = theme.value"
            >
              <UIcon
                class="size-4"
                :name="theme.icon"
              />
              <span>{{ theme.label }}</span>
            </button>
          </div>
        </section>

        <AppearanceColorSetting
          :model-value="accentColor"
          @update:model-value="setAccentColor"
        />

        <AppearanceSizeSetting
          :model-value="settings.interfaceScale"
          title="Interface font size"
          description="Changes navigation, labels, menus and settings without affecting terminal text."
          :value-label="`${interfaceFontSize}px`"
          @update:model-value="updateScale('interfaceScale', $event)"
        >
          <div
            class="flex h-20 overflow-hidden rounded border border-[var(--bitveins-shell-border)]"
            data-interface-preview
            :style="{ fontSize: `${interfaceFontSize}px` }"
          >
            <div class="w-28 border-r border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] p-2">
              <div class="mb-2 font-semibold">
                Sessions
              </div>
              <div class="flex h-6 items-center gap-1.5 rounded bg-[var(--bitveins-shell-accent-soft)] px-1.5">
                <span class="size-1.5 rounded-full bg-[var(--bitveins-shell-accent)]" />
                <span class="truncate">Personal</span>
              </div>
            </div>
            <div class="min-w-0 flex-1 bg-[var(--bitveins-terminal-bg)]">
              <div class="flex h-7 items-end border-b border-[var(--bitveins-shell-border)] px-1">
                <div class="rounded-t border-x border-t border-[var(--bitveins-shell-border)] px-2 py-1">
                  shell
                </div>
              </div>
              <div class="p-2 text-[var(--bitveins-shell-text-muted)]">
                Compact controls stay readable.
              </div>
            </div>
          </div>
        </AppearanceSizeSetting>

        <AppearanceSizeSetting
          :model-value="settings.terminalScale"
          title="Terminal font size"
          description="Changes only xterm output, prompts and interactive terminal programs."
          :value-label="`${terminalFontSize}px`"
          @update:model-value="updateScale('terminalScale', $event)"
        >
          <div
            class="font-mono text-[var(--bitveins-shell-text)]"
            data-terminal-preview
            :style="{ fontSize: `${terminalFontSize}px`, lineHeight: 1.18 }"
          >
            <div>
              <span class="text-[var(--bitveins-shell-accent-strong)]">demo@bitveins</span>:<span class="text-sky-400">~/code</span>$ pnpm test
            </div>
            <div class="text-[var(--bitveins-shell-text-muted)]">
              Tests 441 passed <span class="text-emerald-400">✓</span>
            </div>
          </div>
        </AppearanceSizeSetting>

        <AppearanceSizeSetting
          :model-value="settings.inputScale"
          title="Input font size"
          description="Changes the command composer independently from terminal output."
          :value-label="`${inputFontSize}px`"
          @update:model-value="updateScale('inputScale', $event)"
        >
          <template #control>
            <div
              class="mt-5 flex items-center justify-between gap-5 border-t border-[var(--bitveins-shell-border)] pt-5"
              data-prompt-font-setting
            >
              <div>
                <p class="font-medium text-[var(--bitveins-shell-text)]">
                  Monospaced font
                </p>
                <p class="mt-1 text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
                  Use a coding font in the prompt. Turn it off for the interface font.
                </p>
              </div>
              <USwitch
                aria-label="Monospaced font"
                :model-value="promptMonospace"
                @update:model-value="setPromptMonospace"
              />
            </div>
          </template>

          <div
            class="flex items-end gap-2"
            data-input-preview
          >
            <div
              class="flex min-w-0 flex-1 items-start rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] px-3 py-2 text-[var(--bitveins-shell-text)]"
              :style="{
                fontFamily: 'var(--bitveins-prompt-font-family)',
                fontSize: `${inputFontSize}px`,
                lineHeight: `${INPUT_LINE_HEIGHTS[settings.inputScale]}px`,
                minHeight: `${INPUT_MIN_HEIGHTS[settings.inputScale]}px`,
              }"
            >
              Ask Codex to review the current diff…
            </div>
            <button
              aria-label="Preview send"
              class="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--bitveins-shell-accent)] text-[var(--bitveins-accent-contrast)]"
              tabindex="-1"
              type="button"
            >
              <UIcon
                class="size-4"
                name="i-lucide-send-horizontal"
              />
            </button>
          </div>
        </AppearanceSizeSetting>

        <NotificationSettingsSection />

        <div class="flex items-center justify-between border-t border-[var(--bitveins-shell-border)] py-6">
          <div>
            <p class="font-medium">
              Reset {{ deviceLabel.toLowerCase() }} appearance
            </p>
            <p class="mt-0.5 text-xs text-[var(--bitveins-shell-text-muted)]">
              Return this device profile to its compact defaults.
            </p>
          </div>
          <button
            class="h-8 rounded border border-[var(--bitveins-shell-border-strong)] px-3 text-[var(--bitveins-shell-text-muted)] transition-colors hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]"
            type="button"
            @click="reset"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
