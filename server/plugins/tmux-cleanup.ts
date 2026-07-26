import { useBitveinsContainer } from '../composition/bitveins-container'

export default defineNitroPlugin(() => {
  void useBitveinsContainer().sessions.killAllBitveinsHelpers().catch((error) => {
    console.warn('Unable to clean up stale Bitveins tmux helper sessions.', error)
  })
})
