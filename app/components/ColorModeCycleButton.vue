<script setup lang="ts">
type ThemePreference = 'system' | 'light' | 'dark'

const colorMode = useColorMode()

const themePreferences: ThemePreference[] = ['system', 'light', 'dark']
const themeIcons: Record<ThemePreference, string> = {
  system: 'i-lucide-monitor',
  light: 'i-lucide-sun',
  dark: 'i-lucide-moon',
}
const currentThemePreference = computed<ThemePreference>(() => {
  return themePreferences.includes(colorMode.preference as ThemePreference)
    ? colorMode.preference as ThemePreference
    : 'system'
})
const nextThemePreference = computed<ThemePreference>(() => {
  const currentIndex = themePreferences.indexOf(currentThemePreference.value)

  return themePreferences[(currentIndex + 1) % themePreferences.length] ?? 'system'
})
const themeButtonTitle = computed(() => {
  return `Theme: ${currentThemePreference.value}. Switch to ${nextThemePreference.value}.`
})

function cycleThemePreference(): void {
  colorMode.preference = nextThemePreference.value
}
</script>

<template>
  <UButton
    :aria-label="themeButtonTitle"
    color="neutral"
    :icon="themeIcons[currentThemePreference]"
    size="sm"
    square
    :title="themeButtonTitle"
    variant="ghost"
    @click="cycleThemePreference"
  />
</template>
