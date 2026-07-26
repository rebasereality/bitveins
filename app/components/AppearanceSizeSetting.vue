<script setup lang="ts">
import {
  APPEARANCE_SCALE_LABELS,
  type AppearanceScale,
} from '~/utils/appearance-settings'

const props = defineProps<{
  description: string
  modelValue: AppearanceScale
  title: string
  valueLabel: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AppearanceScale]
}>()

function selectScale(value: number): void {
  emit('update:modelValue', Math.min(4, Math.max(0, value)) as AppearanceScale)
}

function onInput(event: Event): void {
  selectScale(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <section
    class="border-t border-[var(--bitveins-shell-border)] py-6 max-md:py-5"
    :data-appearance-setting="title"
  >
    <div class="flex items-start justify-between gap-5">
      <div>
        <h3 class="font-semibold text-[var(--bitveins-shell-text)]">
          {{ title }}
        </h3>
        <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
          {{ description }}
        </p>
      </div>
      <output class="shrink-0 rounded border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-muted)] px-2 py-1 font-mono text-xs text-[var(--bitveins-shell-text)]">
        {{ valueLabel }}
      </output>
    </div>

    <div class="appearance-control mt-5">
      <div class="appearance-range-wrap">
        <div
          aria-hidden="true"
          class="appearance-marker-axis"
        >
          <span
            v-for="(_, index) in APPEARANCE_SCALE_LABELS"
            :key="index"
            class="appearance-step-marker"
            :data-step-state="index < modelValue ? 'complete' : index === modelValue ? 'selected' : 'idle'"
            :style="{ left: `${index * 25}%` }"
          />
        </div>
        <input
          :aria-label="title"
          class="appearance-range block w-full"
          max="4"
          min="0"
          :value="props.modelValue"
          step="1"
          type="range"
          :style="{ '--appearance-range-progress': `${props.modelValue * 25}%` }"
          @input="onInput"
        >
      </div>
      <div class="appearance-label-axis mt-2">
        <button
          v-for="(label, index) in APPEARANCE_SCALE_LABELS"
          :key="label"
          :aria-pressed="modelValue === index"
          class="appearance-step-label text-center text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)] transition-colors hover:text-[var(--bitveins-shell-text)]"
          :class="{ 'font-medium text-[var(--bitveins-shell-accent-strong)]': modelValue === index }"
          :data-appearance-step="index"
          :style="{ left: `${index * 25}%` }"
          type="button"
          @click="selectScale(index)"
        >
          <span class="max-sm:hidden">{{ label }}</span>
          <span class="sm:hidden">{{ index + 1 }}</span>
        </button>
      </div>
    </div>

    <slot name="control" />

    <div class="mt-4 overflow-hidden rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-bg)]">
      <div class="border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)] px-2 py-1 text-[length:var(--bitveins-ui-micro-size)] uppercase tracking-wider text-[var(--bitveins-shell-text-subtle)]">
        Live preview
      </div>
      <div class="min-h-20 p-3">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.appearance-control {
  --appearance-input-gutter: 25px;
  --appearance-label-gutter: 32px;
}

.appearance-range-wrap {
  position: relative;
  margin-inline: var(--appearance-input-gutter);
}

.appearance-marker-axis {
  position: absolute;
  inset-inline: 7px;
  top: 50%;
  z-index: 0;
  height: 8px;
  transform: translateY(-50%);
}

.appearance-step-marker {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border: 1px solid var(--bitveins-shell-border-strong);
  border-radius: 999px;
  background: var(--bitveins-shell-panel-solid);
  box-shadow: 0 0 0 2px var(--bitveins-shell-panel-solid);
  transform: translate(-50%, -50%);
  transition: border-color 120ms ease, background-color 120ms ease;
}

.appearance-step-marker[data-step-state="complete"] {
  border-color: var(--bitveins-shell-accent);
  background: var(--bitveins-shell-accent);
}

.appearance-step-marker[data-step-state="selected"] {
  border-color: var(--bitveins-shell-accent);
}

.appearance-label-axis {
  position: relative;
  height: calc(var(--bitveins-ui-micro-size) + 7px);
  margin-inline: var(--appearance-label-gutter);
}

.appearance-step-label {
  position: absolute;
  top: 0;
  width: max-content;
  white-space: nowrap;
  transform: translateX(-50%);
}

.appearance-range {
  position: relative;
  z-index: 1;
  height: 16px;
  appearance: none;
  cursor: pointer;
  background: transparent;
}

.appearance-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--bitveins-shell-accent) 0 var(--appearance-range-progress),
    var(--bitveins-shell-border-strong) var(--appearance-range-progress) 100%
  );
}

.appearance-range::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5.5px;
  appearance: none;
  border: 3px solid var(--bitveins-shell-accent);
  border-radius: 999px;
  background: var(--bitveins-shell-panel-solid);
  box-shadow: 0 0 0 2px var(--bitveins-shell-panel-solid);
}

.appearance-range::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background: var(--bitveins-shell-border-strong);
}

.appearance-range::-moz-range-progress {
  height: 3px;
  border-radius: 999px;
  background: var(--bitveins-shell-accent);
}

.appearance-range::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 3px solid var(--bitveins-shell-accent);
  border-radius: 999px;
  background: var(--bitveins-shell-panel-solid);
  box-shadow: 0 0 0 2px var(--bitveins-shell-panel-solid);
}

.appearance-range:focus-visible {
  outline: 1px solid var(--bitveins-shell-accent);
  outline-offset: 3px;
}

@media (max-width: 639px) {
  .appearance-control {
    --appearance-input-gutter: 4px;
    --appearance-label-gutter: 11px;
  }
}
</style>
