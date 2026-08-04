import type { TerminalPeer } from '../modules/terminal/application/terminal-peer-registry'
import { AttentionService } from '../modules/attention/application/attention-service'
import { HermesNotificationService } from '../modules/attention/application/hermes-notification-service'
import { WebPushNotificationService } from '../modules/attention/application/web-push-notification-service'
import { DrizzleAttentionRepository } from '../modules/attention/adapters/drizzle-attention-repository'
import { DrizzleHermesNotificationPreferenceRepository } from '../modules/attention/adapters/drizzle-hermes-notification-preference-repository'
import { DrizzlePushSubscriptionRepository } from '../modules/attention/adapters/drizzle-push-subscription-repository'
import { NodeWebPushSender } from '../modules/attention/adapters/node-web-push-sender'
import { ensureAttentionEnvironment } from '../modules/attention/adapters/attention-environment'
import { DropzoneService } from '../modules/dropzones/application/dropzone-service'
import { DrizzleDropzoneRepository } from '../modules/dropzones/adapters/drizzle-dropzone-repository'
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
import { db, useDrizzle } from '../utils/db'
import { getValidatedEnv } from '../utils/env'

export interface BitveinsContainer {
  attention: AttentionService
  dropzones: DropzoneService
  explorerDocuments: WorkspaceDocumentService
  explorerFileReferences: FileReferenceResolver
  history: HistoryService
  hermesNotifications: HermesNotificationService
  sessions: SessionService
  terminalPeers: TerminalPeerRegistry<TerminalPeer>
  pushPublicKey: string
  pushSubscriptions: DrizzlePushSubscriptionRepository
}

export function createBitveinsContainer(): BitveinsContainer {
  ensureAttentionEnvironment()
  const environment = getValidatedEnv()
  const tmux = new TmuxCliAdapter({
    helperOwner: String(process.pid),
    runner: new NodeCommandRunner(),
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
  const reliableInputs = createReliableInputDeduplicator()
  const terminalPeers = new TerminalPeerRegistry<TerminalPeer>({
    createSession(peer, helperLifecycle) {
      return new TerminalPeerSession({
        attachmentProcesses,
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
  })
  const attention = new AttentionService({
    publisher: {
      publish(event) {
        terminalPeers.broadcastAttention(event)
      },
    },
    push,
    repository: new DrizzleAttentionRepository(useDrizzle()),
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

  return {
    attention,
    dropzones,
    explorerDocuments,
    explorerFileReferences,
    history,
    hermesNotifications,
    sessions,
    terminalPeers,
    pushPublicKey: environment.BITVEINS_VAPID_PUBLIC_KEY,
    pushSubscriptions,
  }
}

let productionContainer: BitveinsContainer | null = null

export function useBitveinsContainer(): BitveinsContainer {
  productionContainer ??= createBitveinsContainer()
  return productionContainer
}
