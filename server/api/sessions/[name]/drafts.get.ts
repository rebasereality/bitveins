import { sessionPromptDraftsResponseSchema } from '#shared/contracts/terminal'
import { useBitveinsContainer } from '../../../composition/bitveins-container'

export default defineEventHandler((event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) {
    throw createError({ statusCode: 400, message: 'Session name is required' })
  }
  const container = useBitveinsContainer()
  const drafts = container.promptDrafts.listDrafts(sessionName)
  return sessionPromptDraftsResponseSchema.parse({ drafts })
})
