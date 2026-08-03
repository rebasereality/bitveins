import { useBitveinsContainer } from '../../composition/bitveins-container'

export default defineEventHandler(() => ({
  events: useBitveinsContainer().attention.list(),
}))
