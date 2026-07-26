<script setup lang="ts">
import { computed } from 'vue'
import {
  ACCENT_COLOR_PRESETS,
  accentColorsForScheme,
  type AccentColorId,
} from '~/utils/accent-colors'

const props = defineProps<{
  modelValue: AccentColorId
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AccentColorId]
}>()

const colorMode = useColorMode()
const colorScheme = computed(() => colorMode.value === 'light' ? 'light' : 'dark')
const activeColors = computed(() => (
  accentColorsForScheme(props.modelValue, colorScheme.value)
))
</script>

<template>
  <section
    class="border-t border-[var(--bitveins-shell-border)] py-6 max-md:py-5"
    data-appearance-color-setting
  >
    <div>
      <h3 class="font-semibold text-[var(--bitveins-shell-text)]">
        Main color
      </h3>
      <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
        Choose the interaction color used across Bitveins, controls and terminal focus.
      </p>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
      <button
        v-for="preset in ACCENT_COLOR_PRESETS"
        :key="preset.id"
        :aria-label="`Use ${preset.label} main color`"
        :aria-pressed="modelValue === preset.id"
        class="group flex min-w-0 flex-col items-center gap-1.5 rounded-md border px-1.5 py-2 text-[length:var(--bitveins-ui-micro-size)] transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-[var(--bitveins-shell-border-strong)] hover:bg-[var(--bitveins-shell-panel)]"
        :class="modelValue === preset.id
          ? 'border-[var(--bitveins-shell-accent)] bg-[var(--bitveins-shell-accent-soft)] text-[var(--bitveins-shell-text)]'
          : 'border-[var(--bitveins-shell-border)] text-[var(--bitveins-shell-text-muted)]'"
        :data-accent-option="preset.id"
        type="button"
        @click="emit('update:modelValue', preset.id)"
      >
        <span
          class="relative grid size-8 place-items-center overflow-hidden rounded-full border border-white/15 shadow-sm shadow-black/20 ring-1 ring-black/10"
          :style="{
            background: `linear-gradient(135deg, ${preset.light.accent} 0 50%, ${preset.dark.accent} 50% 100%)`,
          }"
        >
          <span
            v-if="modelValue === preset.id"
            class="grid size-4 place-items-center rounded-full shadow-sm"
            :style="{
              backgroundColor: activeColors.accent,
              color: activeColors.contrast,
            }"
          >
            <UIcon
              class="size-3"
              name="i-lucide-check"
            />
          </span>
        </span>
        <span class="truncate">{{ preset.label }}</span>
      </button>
    </div>

    <div class="mt-4 flex items-center justify-between gap-3 overflow-hidden rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-bg)] p-3">
      <div class="min-w-0">
        <p class="font-medium text-[var(--bitveins-shell-text)]">
          Live accent preview
        </p>
        <p class="mt-0.5 truncate text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-muted)]">
          Foreground contrast is calculated from the active shade.
        </p>
      </div>
      <button
        class="h-8 shrink-0 rounded-md px-3 font-medium shadow-sm"
        data-accent-contrast-preview
        :style="{
          backgroundColor: activeColors.accent,
          color: activeColors.contrast,
        }"
        tabindex="-1"
        type="button"
      >
        Primary action
      </button>
    </div>
  </section>
</template>
