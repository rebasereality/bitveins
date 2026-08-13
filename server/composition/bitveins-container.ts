import type { TerminalPeer } from '../modules/terminal/application/terminal-peer-registry'
import { AttentionService } from '../modules/attention/application/attention-service'
import { CodexNotificationService } from '../modules/attention/application/codex-notification-service'
import { HermesNotificationService } from '../modules/attention/application/hermes-notification-service'
import { CodexAgentMetadataService } from '../modules/agents/application/codex-agent-metadata-service'
import { CodexAppServerThreadMetadataReader } from '../modules/agents/adapters/codex-app-server-thread-metadata-reader'
import { GitCliAgentMetadataResolver } from '../modules/agents/adapters/git-cli-agent-metadata-resolver'
import { LinuxCodexProcessInspector } from '../modules/agents/adapters/linux-codex-process-inspector'
import { WebPushNotificationService } from '../modules/attention/application/web-push-notification-service'
import { DrizzleAttentionRepository } from '../modules/attention/adapters/drizzle-attention-repository'
import { DrizzleCodexNotificationPreferenceRepository } from '../modules/attention/adapters/drizzle-codex-notification-preference-repository'
import { DrizzleHermesNotificationPreferenceRepository } from '../modules/attention/adapters/drizzle-hermes-notification-preference-repository'
import { DrizzlePushSessionMuteRepository } from '../modules/attention/adapters/drizzle-push-session-mute-repository'
import { DrizzlePushSubscriptionRepository } from '../modules/attention/adapters/drizzle-push-subscription-repository'
import { NodeWebPushSender } from '../modules/attention/adapters/node-web-push-sender'
import { ensureAttentionEnvironment } from '../modules/attention/adapters/attention-environment'
import { DropzoneService } from '../modules/dropzones/application/dropzone-service'
import { DrizzleDropzoneRepository } from '../modules/dropzones/adapters/drizzle-dropzone-repository'
import { GitViewerService } from '../modules/git/application/git-viewer-service'
import { GitCliRepository } from '../modules/git/adapters/git-cli-repository'
import { FileReferenceResolver } from '../modules/explorer/application/file-reference-resolver'
import { WorkspaceDocumentService } from '../modules/explorer/application/workspace-document-service'
import { NodeWorkspaceCandidateLocator } from '../modules/explorer/adapters/node-workspace-candidate-locator'
import { NodeWorkspaceDocumentRepository } from '../modules/explorer/adapters/node-workspace-document-repository'
import { HistoryService } from '../modules/history/application/history-service'
import { DrizzleHistoryRepository } from '../modules/history/adapters/drizzle-history-repository'
import { SessionService } from '../modules/sessions/application/session-service'
import { NodePathInspector } from '../modules/sessions/adapters/node-path-inspector'
import { NodeSessionPathResolver } from '../modules/sessions/adapters/node-session-path-resolver'
import { SqliteSessionRepository } from '../modules/sessions/adapters/sqlite-session-repository'
import { NodeCommandRunner } from '../modules/sessions/adapters/tmux/node-command-runner'
import { TmuxCliAdapter } from '../modules/sessions/adapters/tmux/tmux-cli-adapter'
import { createReliableInputDeduplicator } from '../modules/terminal/application/reliable-input-deduplicator'
import { TerminalPeerRegistry } from '../modules/terminal/application/terminal-peer-registry'
import { TerminalPeerSession } from '../modules/terminal/application/terminal-peer-session'
import { NodePtyFactory } from '../modules/terminal/adapters/node-pty-factory'
import { TmuxTerminalAttachmentProcessFactory } from '../modules/terminal/adapters/tmux-terminal-attachment-process-factory'
import { TmuxPaneControlProcessFactory } from '../modules/terminal/adapters/tmux-pane-control-process-factory'
import { db, useDrizzle } from '../utils/db'
import { getValidatedEnv } from '../utils/env'

export interface BitveinsContainer {
  attention: AttentionService
  codexNotifications: CodexNotificationService
  codexThreadMetadata: CodexAppServerThreadMetadataReader
  dropzones: DropzoneService
  explorerDocuments: WorkspaceDocumentService
  explorerFileReferences: FileReferenceResolver
  gitViewer: GitViewerService
  history: HistoryService
  hermesNotifications: HermesNotificationService
  sessions: SessionService
  terminalPeers: TerminalPeerRegistry<TerminalPeer>
  pushPublicKey: string
  pushSessionMutes: DrizzlePushSessionMuteRepository
  pushSubscriptions: DrizzlePushSubscriptionRepository
}

export function createBitveinsContainer(): BitveinsContainer {
  ensureAttentionEnvironment()
  const environment = getValidatedEnv()
  const codexThreadMetadata = new CodexAppServerThreadMetadataReader()
  const codexAgentMetadata = new CodexAgentMetadataService({
    processes: new LinuxCodexProcessInspector(),
    threads: codexThreadMetadata,
  })
  const commandRunner = new NodeCommandRunner()
  const gitViewer = new GitViewerService(new GitCliRepository({ runner: commandRunner }))
  const tmux = new TmuxCliAdapter({
    agentGitMetadata: new GitCliAgentMetadataResolver({ runner: commandRunner }),
    codexAgentMetadata,
    helperOwner: String(process.pid),
    runner: commandRunner,
    socketName: environment.BITVEINS_TMUX_SOCKET_NAME,
  })
  const sessions = new SessionService({
    home: process.env.HOME || process.cwd(),
    logger: {
      error(message, error) {
        console.error(message, error)
      },
    },
    pathInspector: new NodePathInspector(),
    repository: new SqliteSessionRepository(db),
    sessionPathResolver: new NodeSessionPathResolver({
      cwd: process.cwd(),
      home: process.env.HOME || process.cwd(),
    }),
    tmux,
  })
  const history = new HistoryService({
    repository: new DrizzleHistoryRepository(useDrizzle()),
  })
  const dropzones = new DropzoneService({
    repository: new DrizzleDropzoneRepository(useDrizzle()),
  })
  const explorerDocumentRepository = new NodeWorkspaceDocumentRepository()
  const explorerDocuments = new WorkspaceDocumentService(explorerDocumentRepository)
  const explorerFileReferences = new FileReferenceResolver(
    new NodeWorkspaceCandidateLocator(explorerDocumentRepository),
  )
  const ptyFactory = new NodePtyFactory()
  const attachmentProcesses = new TmuxTerminalAttachmentProcessFactory({
    cwd: process.env.HOME || process.cwd(),
    env: process.env,
    ptyFactory,
    socketName: environment.BITVEINS_TMUX_SOCKET_NAME,
  })
  const paneControlProcesses = new TmuxPaneControlProcessFactory({
    cwd: process.env.HOME || process.cwd(),
    env: process.env,
    socketName: environment.BITVEINS_TMUX_SOCKET_NAME,
  })
  const reliableInputs = createReliableInputDeduplicator()
  const terminalPeers = new TerminalPeerRegistry<TerminalPeer>({
    createSession(peer, helperLifecycle) {
      return new TerminalPeerSession({
        attachmentProcesses,
        paneControlProcesses,
        onHelperActivated: helperLifecycle.activated,
        onHelperReleased: helperLifecycle.released,
        reliableInputs,
        send(message) {
          try {
            peer.send(JSON.stringify(message))
          }
          catch {
            // PTY callbacks can run after the browser has closed its peer.
          }
        },
        sessions,
      })
    },
    sessions,
  })
  const pushSubscriptions = new DrizzlePushSubscriptionRepository(useDrizzle())
  const pushSessionMutes = new DrizzlePushSessionMuteRepository(useDrizzle())
  const push = new WebPushNotificationService({
    logger: {
      warn(message, details) {
        console.warn(message, details)
      },
    },
    repository: pushSubscriptions,
    sender: new NodeWebPushSender({
      privateKey: environment.BITVEINS_VAPID_PRIVATE_KEY,
      publicKey: environment.BITVEINS_VAPID_PUBLIC_KEY,
    }),
    sessionMutes: pushSessionMutes,
  })
  const attention = new AttentionService({
    publisher: {
      publish(event) {
        terminalPeers.broadcastAttention(event)
      },
    },
    push,
    repository: new DrizzleAttentionRepository(useDrizzle()),
    resolveSessionId: sessionName => sessions.findSessionIdByName(sessionName),
    resolveWindowName: async (sessionName, windowId) => {
      const windows = await sessions.listWindows(sessionName)
      return windows.find(window => window.id === windowId)?.name ?? null
    },
  })
  const hermesNotificationPreferences = new DrizzleHermesNotificationPreferenceRepository(useDrizzle())
  const hermesNotifications = new HermesNotificationService({
    attention,
    preferences: hermesNotificationPreferences,
    reportResolutionError: () => {
      console.warn('Hermes session resolution failed; event suppressed.')
    },
    windowSessions: sessions,
  })
  const codexNotificationPreferences = new DrizzleCodexNotificationPreferenceRepository(useDrizzle())
  const codexNotifications = new CodexNotificationService({
    attention,
    preferences: codexNotificationPreferences,
    reportResolutionError: () => {
      console.warn('Codex session resolution failed; event suppressed.')
    },
    windowSessions: sessions,
  })

  return {
    attention,
    codexNotifications,
    codexThreadMetadata,
    dropzones,
    explorerDocuments,
    explorerFileReferences,
    gitViewer,
    history,
    hermesNotifications,
    sessions,
    terminalPeers,
    pushPublicKey: environment.BITVEINS_VAPID_PUBLIC_KEY,
    pushSessionMutes,
    pushSubscriptions,
  }
}

let productionContainer: BitveinsContainer | null = null

export function useBitveinsContainer(): BitveinsContainer {
  productionContainer ??= createBitveinsContainer()
  return productionContainer
}
