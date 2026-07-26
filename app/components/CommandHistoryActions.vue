<script setup lang="ts">
defineProps<{
  canDown: boolean
  canUp: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  down: []
  up: []
}>()
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      :disabled="disabled || !canUp"
      color="neutral"
      icon="i-lucide-arrow-up"
      size="xs"
      square
      title="Previous message (History Up)"
      type="button"
      variant="subtle"
      @mousedown.prevent
      @pointerdown.prevent
      @click="emit('up')"
    />

    <UButton
      :disabled="disabled || !canDown"
      color="neutral"
      icon="i-lucide-arrow-down"
      size="xs"
      square
      title="Next message (History Down)"
      type="button"
      variant="subtle"
      @mousedown.prevent
      @pointerdown.prevent
      @click="emit('down')"
    />
  </div>
</template>
