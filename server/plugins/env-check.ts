import { assertProductionEnv, getValidatedEnv } from '../utils/env'
import { ensureAttentionEnvironment } from '../modules/attention/adapters/attention-environment'

export default defineNitroPlugin(() => {
  ensureAttentionEnvironment()
  assertProductionEnv(getValidatedEnv())
})
