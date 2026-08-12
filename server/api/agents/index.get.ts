import { useBitveinsContainer } from '../../composition/bitveins-container'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async () => ({
  agents: await sessions.listAgents(),
}))
