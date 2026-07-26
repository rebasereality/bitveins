import { useBitveinsContainer } from '../../composition/bitveins-container'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async () => {
  return {
    sessions: await sessions.listSessions(),
  }
})
