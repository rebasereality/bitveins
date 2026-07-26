import { useBitveinsContainer } from '../composition/bitveins-container'

const peers = useBitveinsContainer().terminalPeers

export default defineWebSocketHandler({
  async upgrade(request) {
    try {
      assertAllowedOrigin(request.headers.get('origin'))
      await requireBitveinsSession(request)
    }
    catch (error: unknown) {
      throw new Response(error instanceof Error ? error.message : 'Unauthorized', {
        status: 401,
      })
    }
  },
  open(peer) {
    peers.open(peer)
  },
  message(peer, message) {
    return peers.message(peer, message.text())
  },
  close(peer) {
    void peers.close(peer)
  },
  error(peer, error) {
    void peers.fail(peer, error)
  },
})
