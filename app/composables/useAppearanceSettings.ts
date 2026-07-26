import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_PROFILES,
  INPUT_FONT_SIZES,
  INTERFACE_FONT_SIZES,
  LEGACY_APPEARANCE_STORAGE_KEY,
  PROMPT_MONOSPACE_STORAGE_KEY,
  appearanceSettingsCssVariables,
  parseAppearanceProfiles,
  parsePromptMonospace,
  terminalFontSizesForDevice,
  type AppearanceDevice,
  type AppearanceProfiles,
  type AppearanceScale,
  type AppearanceScaleKey,
  type AppearanceSettings,
} from '~/utils/appearance-settings'
import {
  ACCENT_COLOR_STORAGE_KEY,
  DEFAULT_ACCENT_COLOR,
  accentColorPreset,
  accentColorsForScheme,
  accentCssVariables,
  parseAccentColor,
  type AccentColorId,
  type AppearanceColorScheme,
} from '~/utils/accent-colors'

const MONOSPACE_PROMPT_STACK = '"JetBrains Mono", "SFMono-Regular", "Cascadia Code", monospace'
const SANS_PROMPT_STACK = '"Inter Variable", Inter, "Segoe UI Variable", "Segoe UI", sans-serif'

function applySettings(
  settings: AppearanceSettings,
  device: AppearanceDevice,
  accentColor: AccentColorId,
  colorScheme: AppearanceColorScheme,
  promptMonospace: boolean,
): void {
  if (!import.meta.client) return

  const root = document.documentElement
  const cssVariables = appearanceSettingsCssVariables(settings)
  const accentColors = accentColorsForScheme(accentColor, colorScheme)

  Object.entries({
    ...cssVariables,
    ...accentCssVariables(accentColors),
    '--bitveins-prompt-font-family': promptMonospace
      ? MONOSPACE_PROMPT_STACK
      : SANS_PROMPT_STACK,
  }).forEach(([property, value]) => {
    root.style.setProperty(property, value)
  })

  root.dataset.bitveinsInterfaceScale = String(settings.interfaceScale)
  root.dataset.bitveinsTerminalScale = String(settings.terminalScale)
  root.dataset.bitveinsInputScale = String(settings.inputScale)
  root.dataset.bitveinsAppearanceDevice = device
  root.dataset.bitveinsAccent = accentColor
  root.dataset.bitveinsPromptMonospace = String(promptMonospace)

  updateAppConfig({
    ui: {
      colors: {
        primary: accentColorPreset(accentColor).tailwindColor,
      },
    },
  })
}

export function useAppearanceSettings() {
  const colorMode = useColorMode()
  const profiles = useState<AppearanceProfiles>('bitveins-appearance-profiles-v2', () => ({
    desktop: { ...DEFAULT_APPEARANCE_PROFILES.desktop },
    mobile: { ...DEFAULT_APPEARANCE_PROFILES.mobile },
  }))
  const activeDevice = useState<AppearanceDevice>('bitveins-appearance-device', () => 'desktop')
  const initialized = useState<boolean>('bitveins-appearance-profiles-v2-initialized', () => false)
  const deviceListenerInitialized = useState<boolean>('bitveins-appearance-device-listener', () => false)
  const colorModeListenerInitialized = useState<boolean>('bitveins-appearance-color-mode-listener', () => false)
  const accentColor = useState<AccentColorId>(
    'bitveins-appearance-accent',
    () => DEFAULT_ACCENT_COLOR,
  )
  const promptMonospace = useState<boolean>(
    'bitveins-appearance-prompt-monospace',
    () => true,
  )
  const settings = computed(() => profiles.value[activeDevice.value])
  const colorScheme = computed<AppearanceColorScheme>(() => (
    colorMode.value === 'light' ? 'light' : 'dark'
  ))
  const activeAccent = computed(() => (
    accentColorsForScheme(accentColor.value, colorScheme.value)
  ))

  function applyActiveSettings(): void {
    applySettings(
      settings.value,
      activeDevice.value,
      accentColor.value,
      colorScheme.value,
      promptMonospace.value,
    )
  }

  function persist(): void {
    if (!import.meta.client) return
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(profiles.value))
    applyActiveSettings()
  }

  function initialize(): void {
    if (!import.meta.client) return

    const mobileQuery = window.matchMedia('(max-width: 1023px)')
    activeDevice.value = mobileQuery.matches ? 'mobile' : 'desktop'

    if (!initialized.value) {
      const legacyRaw = window.localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY)
      profiles.value = parseAppearanceProfiles(
        window.localStorage.getItem(APPEARANCE_STORAGE_KEY),
        legacyRaw,
        activeDevice.value,
      )
      accentColor.value = parseAccentColor(
        window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY),
      )
      promptMonospace.value = parsePromptMonospace(
        window.localStorage.getItem(PROMPT_MONOSPACE_STORAGE_KEY),
      )
      initialized.value = true

      if (legacyRaw) {
        window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(profiles.value))
        window.localStorage.removeItem(LEGACY_APPEARANCE_STORAGE_KEY)
      }
    }

    if (!deviceListenerInitialized.value) {
      mobileQuery.addEventListener('change', (event) => {
        activeDevice.value = event.matches ? 'mobile' : 'desktop'
        applyActiveSettings()
      })
      deviceListenerInitialized.value = true
    }

    if (!colorModeListenerInitialized.value) {
      watch(colorMode, applyActiveSettings)
      colorModeListenerInitialized.value = true
    }

    applyActiveSettings()
  }

  function setScale(key: AppearanceScaleKey, value: AppearanceScale): void {
    profiles.value = {
      ...profiles.value,
      [activeDevice.value]: { ...settings.value, [key]: value },
    }
    persist()
  }

  function setAccentColor(value: AccentColorId): void {
    accentColor.value = value
    if (import.meta.client) {
      window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, value)
    }
    applyActiveSettings()
  }

  function setPromptMonospace(value: boolean): void {
    promptMonospace.value = value
    if (import.meta.client) {
      window.localStorage.setItem(PROMPT_MONOSPACE_STORAGE_KEY, JSON.stringify(value))
    }
    applyActiveSettings()
  }

  function reset(): void {
    profiles.value = {
      ...profiles.value,
      [activeDevice.value]: { ...DEFAULT_APPEARANCE_PROFILES[activeDevice.value] },
    }
    persist()
  }

  return {
    accentColor,
    activeAccent,
    activeDevice,
    profiles,
    promptMonospace,
    settings,
    initialize,
    inputFontSize: computed(() => INPUT_FONT_SIZES[settings.value.inputScale]),
    interfaceFontSize: computed(() => INTERFACE_FONT_SIZES[settings.value.interfaceScale]),
    terminalFontSize: computed(() => (
      terminalFontSizesForDevice(activeDevice.value)[settings.value.terminalScale]
    )),
    setAccentColor,
    setPromptMonospace,
    setScale,
    reset,
  }
}
