<script setup lang="ts">
const { initialize } = useAppearanceSettings()
initialize()
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <ClientOnly>
      <AuthGate />
    </ClientOnly>
  </UApp>
</template>
