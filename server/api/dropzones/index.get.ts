import { useBitveinsContainer } from '../../composition/bitveins-container'

export default defineEventHandler(() => {
  return {
    dropzones: useBitveinsContainer().dropzones.list(),
  }
})
