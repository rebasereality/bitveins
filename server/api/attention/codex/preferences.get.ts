import { useBitveinsContainer } from '../../../composition/bitveins-container'

export default defineEventHandler(() => ({
  preference: useBitveinsContainer().codexNotifications.getPreference(),
}))
