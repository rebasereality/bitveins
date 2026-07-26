// @vitest-environment happy-dom

import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useCommandInputHistory } from '../../../app/composables/useCommandInputHistory'

describe('useCommandInputHistory', () => {
  it('starts empty and clears editor state when the conversation changes', async () => {
    const scopeKey = ref<string | null>('session:@1:0')
    const history = useCommandInputHistory({
      historyMessages: ref(['previous command']),
      promptRecoveryKey: scopeKey,
    })

    expect(history.value.value).toBe('')
    history.value.value = 'draft for the first conversation'
    history.historyUp()

    scopeKey.value = 'session:@2:1'
    await nextTick()

    expect(history.value.value).toBe('')
    expect(history.historyIndex.value).toBe(-1)
  })
})
