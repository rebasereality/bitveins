import type { Ref } from 'vue'
import type { TmuxWindow } from '~/types/session'
import { apiErrorMessage } from '~/utils/api-error'
import {
  PathLinkRootRepository,
  pathLinkRootScope,
} from '~/utils/path-link-root-repository'

export function usePathLinkRoots(
  activeSession: Ref<string | null>,
  activeWindow: Readonly<Ref<TmuxWindow | null>>,
) {
  const rootChoices = ref<string[] | null>(null)
  const repository = shallowRef<PathLinkRootRepository | null>(null)
  const revision = ref(0)
  const activeScope = computed(() => (
    activeSession.value && activeWindow.value
      ? pathLinkRootScope(activeSession.value, activeWindow.value.id)
      : null
  ))
  const currentRoot = computed(() => {
    void revision.value
    return activeScope.value ? repository.value?.get(activeScope.value) ?? null : null
  })
  const hasAnyRoots = computed(() => {
    void revision.value
    return repository.value?.hasAny() ?? false
  })

  onMounted(() => {
    repository.value = new PathLinkRootRepository(window.localStorage)
    revision.value += 1
  })

  watch(activeSession, () => {
    rootChoices.value = null
  })

  function rememberRoot(root: string): void {
    if (!activeScope.value) return
    repository.value?.set(activeScope.value, root)
    revision.value += 1
  }

  async function changeRoot(): Promise<void> {
    if (!activeSession.value) return
    try {
      const response = await $fetch<{ roots: string[] }>(
        `/api/sessions/${encodeURIComponent(activeSession.value)}/files/roots`,
      )
      rootChoices.value = response.roots
    }
    catch (error: unknown) {
      alert(`Unable to list project roots: ${apiErrorMessage(error, 'Request failed')}`)
    }
  }

  function selectRoot(root: string): void {
    rememberRoot(root)
    rootChoices.value = null
  }

  function forgetCurrentRoot(): void {
    if (!activeScope.value) return
    repository.value?.forget(activeScope.value)
    revision.value += 1
  }

  function forgetAllRoots(): void {
    repository.value?.forgetAll()
    revision.value += 1
  }

  return {
    changeRoot,
    currentRoot,
    forgetAllRoots,
    forgetCurrentRoot,
    hasAnyRoots,
    rememberRoot,
    rootChoices,
    selectRoot,
  }
}
