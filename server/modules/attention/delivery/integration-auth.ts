import { timingSafeEqual } from 'node:crypto'

interface IntegrationRequest {
  authorization?: string
  remoteAddress?: string
}

export function assertEventIntegrationRequest(
  request: IntegrationRequest,
  expectedToken: string,
): void {
  const loopback = request.remoteAddress === '127.0.0.1'
    || request.remoteAddress === '::1'
    || request.remoteAddress === '::ffff:127.0.0.1'
  const prefix = 'Bearer '
  const provided = request.authorization?.startsWith(prefix)
    ? request.authorization.slice(prefix.length)
    : ''
  const expectedBuffer = Buffer.from(expectedToken)
  const providedBuffer = Buffer.from(provided)
  const authenticated = expectedBuffer.length > 0
    && expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer)

  if (!loopback || !authenticated) {
    throw new Error('Unauthorized event integration request.')
  }
}
