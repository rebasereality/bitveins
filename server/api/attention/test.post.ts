import { useBitveinsContainer } from '../../composition/bitveins-container'
import { assertBrowserAttentionRateLimit } from '../../modules/attention/delivery/browser-event-rate-limit'

export default defineEventHandler(async () => {
  assertBrowserAttentionRateLimit()
  return {
    event: await useBitveinsContainer().attention.create({
      source: 'bitveins',
      title: 'Test notification',
      type: 'information',
    }),
  }
})
