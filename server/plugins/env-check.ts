import { assertProductionEnv, getValidatedEnv } from '../utils/env'

export default defineNitroPlugin(() => {
  assertProductionEnv(getValidatedEnv())
})
