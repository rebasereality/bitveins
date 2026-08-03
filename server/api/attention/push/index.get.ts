import { pushConfigurationQuerySchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestQuery } from '../../../utils/request-validation'

export default defineEventHandler((event) => {
  const container = useBitveinsContainer()
  const query = readRequestQuery(event, pushConfigurationQuerySchema)
  return {
    publicKey: container.pushPublicKey,
    preference: container.pushSubscriptions.getPreference(query.endpoint),
  }
})
