import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { createRenameWindowHandler } from '../../../../modules/sessions/delivery/rename-window-handler'

const handleRenameWindow = createRenameWindowHandler(useBitveinsContainer().sessions)

export default defineEventHandler(async event => handleRenameWindow({
  body: await readBody<unknown>(event),
  index: getRouterParam(event, 'index'),
  sessionName: getRouterParam(event, 'name'),
}))
