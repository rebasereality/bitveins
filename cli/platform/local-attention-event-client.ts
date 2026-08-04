import { attentionEventResponseSchema, type CreateAttentionEvent } from '../../shared/contracts/attention'
import type { EnvironmentRepository } from '../ports/environment-repository'
import { CliError } from '../core/cli-error'

export class LocalAttentionEventClient {
  constructor(private readonly options: {
    environment: Pick<EnvironmentRepository, 'read'>
    fetcher?: typeof fetch
    timeoutMs?: number
  }) {}

  async create(event: CreateAttentionEvent): Promise<string> {
    const environment = await this.options.environment.read()
    const fetcher = this.options.fetcher ?? fetch
    const endpoint = `http://127.0.0.1:${environment.port}/api/integrations/events`
    let response: Response
    try {
      response = await fetcher(
        endpoint,
        {
          body: JSON.stringify(event),
          headers: {
            'authorization': `Bearer ${environment.eventToken}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        },
      )
    }
    catch (error) {
      throw new CliError('Unable to connect to the local Bitveins service.', { cause: error })
    }

    if (response.url !== endpoint) {
      throw new CliError('The local Bitveins service responded from an unexpected URL.')
    }
    if (!response.ok) {
      throw new CliError(`Unable to create the Bitveins event (HTTP ${response.status}).`)
    }
    try {
      return attentionEventResponseSchema.parse(await response.json()).event.id
    }
    catch (error) {
      throw new CliError('The local Bitveins service returned an invalid event response.', { cause: error })
    }
  }
}
