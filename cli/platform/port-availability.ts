import { createServer } from 'node:net'

export async function isLoopbackPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(error => resolve(!error))
    })
  })
}
