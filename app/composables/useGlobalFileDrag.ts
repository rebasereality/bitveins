import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function dragTypesContainFiles(types: ArrayLike<string> | null | undefined): boolean {
  return types ? Array.from(types).includes('Files') : false
}

export function useGlobalFileDrag(hasTargets: Readonly<Ref<boolean>>) {
  const isDraggingFiles = ref(false)
  let dragDepth = 0

  function reset(): void {
    dragDepth = 0
    isDraggingFiles.value = false
  }

  function onDragEnter(event: DragEvent): void {
    if (!dragTypesContainFiles(event.dataTransfer?.types)) return
    event.preventDefault()
    dragDepth += 1
    isDraggingFiles.value = hasTargets.value
  }

  function onDragOver(event: DragEvent): void {
    if (!dragTypesContainFiles(event.dataTransfer?.types) && dragDepth === 0) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    if (dragDepth > 0 && hasTargets.value) isDraggingFiles.value = true
  }

  function onDragLeave(event: DragEvent): void {
    if (dragDepth === 0) return
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) reset()
  }

  function onDrop(event: DragEvent): void {
    if (!dragTypesContainFiles(event.dataTransfer?.types) && dragDepth === 0) return
    event.preventDefault()
    reset()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') reset()
  }

  onMounted(() => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('keydown', onKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('drop', onDrop)
    window.removeEventListener('dragend', reset)
    window.removeEventListener('blur', reset)
    window.removeEventListener('keydown', onKeydown)
  })

  return {
    isDraggingFiles,
    reset,
  }
}
