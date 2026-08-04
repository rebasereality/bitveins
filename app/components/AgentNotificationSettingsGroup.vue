<script setup lang="ts">
const props = defineProps<{
  agent: string
  description: string
  icon?: string
  logoSrc?: string
  title: string
}>()

if (Boolean(props.icon) === Boolean(props.logoSrc)) {
  throw new Error('Agent notification settings require exactly one icon or logo.')
}

const titleId = computed(() => `agent-notification-${props.agent}-title`)
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="overflow-hidden rounded-md border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)]"
    :data-agent-notification-settings="agent"
  >
    <header class="px-4 py-4 sm:px-5">
      <div class="flex items-start gap-3">
        <span
          aria-hidden="true"
          class="grid size-9 shrink-0 place-items-center rounded border border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel-muted)] text-[var(--bitveins-shell-text-muted)]"
        >
          <img
            v-if="logoSrc"
            alt=""
            class="size-7 rounded-sm object-contain"
            data-agent-notification-logo
            height="28"
            :src="logoSrc"
            width="28"
          >
          <UIcon
            v-else
            class="size-4"
            :name="icon"
          />
        </span>
        <div class="min-w-0">
          <h4
            :id="titleId"
            class="text-sm font-medium text-[var(--bitveins-shell-text)]"
          >
            {{ title }}
          </h4>
          <p class="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--bitveins-shell-text-muted)]">
            {{ description }}
          </p>
        </div>
      </div>
    </header>

    <div class="border-t border-[var(--bitveins-shell-border)] px-4 sm:px-5">
      <slot />
    </div>
  </section>
</template>
