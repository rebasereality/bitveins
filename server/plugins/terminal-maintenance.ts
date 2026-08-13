import { useBitveinsContainer } from '../composition/bitveins-container'

const HEARTBEAT_INTERVAL_MS = 20_000
const HELPER_CLEANUP_INTERVAL_MS = 5 * 60_000

export default defineNitroPlugin((nitroApp) => {
  const container = useBitveinsContainer()
  const peers = container.terminalPeers
  const heartbeatTimer = setInterval(() => peers.heartbeat(), HEARTBEAT_INTERVAL_MS)
  const cleanupTimer = setInterval(() => {
    void peers.cleanupStaleHelpers()
  }, HELPER_CLEANUP_INTERVAL_MS)

  heartbeatTimer.unref()
  cleanupTimer.unref()

  nitroApp.hooks.hook('close', async () => {
    clearInterval(heartbeatTimer)
    clearInterval(cleanupTimer)
    container.codexThreadMetadata.dispose()
    await peers.dispose()
  })
})
