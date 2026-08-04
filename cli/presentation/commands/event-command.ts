import { createAttentionEventSchema, type CreateAttentionEvent } from '../../../shared/contracts/attention'
import { CliExitCode, CliUsageError } from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { DetectedAttentionContext } from '../../platform/tmux-attention-context-detector'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

export class EventCommand implements CliCommand {
  readonly description = 'Create an Agent Inbox event on the local Bitveins instance.'
  readonly name = 'event'
  readonly usage = 'bitveins event <type> --source <source> --title <title> [options]'
  readonly usageDetails = [
    '<type>              input_required, permission_required, completed, failed or information.',
    '--type <type>       Backward-compatible alternative to the positional type.',
    '--source <source>   Generic event source, for example shell or local-script.',
    '--title <title>     Short event title.',
    '--summary <text>    Optional event summary.',
    '--project <name>    Optional project name.',
    '--session <name>    Related tmux session.',
    '--window <id>       Stable tmux window id such as @4.',
    '--pane <id>         Stable tmux pane id such as %9.',
  ]

  constructor(private readonly options: {
    create(event: CreateAttentionEvent): Promise<string>
    detectContext(environment: NodeJS.ProcessEnv): Promise<DetectedAttentionContext>
    environment: NodeJS.ProcessEnv
    output: CliOutput
  }) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const positionalType = args[0]?.startsWith('--') ? undefined : args[0]
    const parser = new CommandArguments(positionalType ? args.slice(1) : args)
    const type = positionalType ?? parser.value('--type')
    const source = parser.value('--source')
    const title = parser.value('--title')
    const summary = parser.value('--summary')
    const project = parser.value('--project')
    const sessionName = parser.value('--session')
    const windowId = parser.value('--window')
    const paneId = parser.value('--pane')
    parser.done()

    if (!type) throw new CliUsageError('An event type is required.')
    if (!source) throw new CliUsageError('--source is required.')
    if (!title) throw new CliUsageError('--title is required.')

    const detected = await this.options.detectContext(this.options.environment)
    const candidate = {
      type,
      source,
      title,
      ...(summary ? { summary } : {}),
      ...(project || detected.project ? { project: project ?? detected.project } : {}),
      ...(sessionName || detected.sessionName ? { sessionName: sessionName ?? detected.sessionName } : {}),
      ...(windowId || detected.windowId ? { windowId: windowId ?? detected.windowId } : {}),
      ...(paneId || detected.paneId ? { paneId: paneId ?? detected.paneId } : {}),
    }
    const parsed = createAttentionEventSchema.safeParse(candidate)
    if (!parsed.success) {
      throw new CliUsageError(`Invalid event: ${parsed.error.issues[0]?.message ?? 'validation failed.'}`)
    }

    const id = await this.options.create(parsed.data)
    this.options.output.success(`Created ${id}`)
    return CliExitCode.Success
  }
}
