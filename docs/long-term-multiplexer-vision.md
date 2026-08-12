# Long-term multiplexer and agent-awareness vision

## Purpose

Bitveins is currently a browser and PWA cockpit for existing tmux sessions. Its
durable product advantage is not terminal persistence alone: it combines real
terminal processes with a mobile-friendly Async composer, reliable submission,
Live input, notifications, and file exploration.

The long-term opportunity is to make that cockpit agent-aware without giving up
the underlying multiplexer as the source of truth. A later phase could support
more than one multiplexer runtime, with tmux remaining the default and Herdr as
an optional agent-native backend.

This document records the feasibility findings, architectural boundaries, and
recommended sequencing for both directions.

## Product principles

1. The runtime owns terminal processes, panes, geometry, focus, and lifecycle.
2. Bitveins renders and controls that runtime; it must not create a competing
   browser-only pane model.
3. Agent states must be evidence-based. A live process is not proof that an
   agent is working, and a sleeping process is not proof that it is blocked.
4. Unsupported or ambiguous states are shown as `unknown`, not guessed.
5. Async composition, reliable delivery, mobile access, and Explorer remain
   Bitveins capabilities regardless of the selected runtime.
6. Runtime sockets and control APIs stay server-side. The browser receives only
   authenticated, narrowly scoped Bitveins contracts.

## Near-term: agent-aware tmux

### Desired experience

The session sidebar groups live agents below their tmux session:

```text
Sessions
├─ project-a
│  ├─ ■ API refactor          Codex
│  └─ ■ dependency review     Claude
└─ project-b
   └─ ■ supplier import       Hermes
```

An agent row contains:

- a theme-sized state indicator;
- a display label derived from the live terminal title, with a safe fallback;
- the detected agent kind;
- an optional user-defined label stored on the tmux pane;
- stable session, window, and pane targets;
- direct navigation to the owning pane.

The initial visual mapping is:

| State | Meaning | Default color role |
| --- | --- | --- |
| `working` | The agent is actively producing a response or running work | green |
| `blocked` | The agent needs input, approval, or a decision | yellow |
| `failed` | The current agent interaction has an actionable failure | red |
| `idle` | The agent is ready, finished, or waiting without a known blocker | gray |
| `unknown` | Bitveins detects the agent but cannot classify it confidently | neutral outline |

Color is never the only signal. Each indicator also exposes a text label and
accessible description.

### Discovery model

Bitveins can enumerate every pane on the configured tmux server with one
`list-panes -a` snapshot. The inventory should include:

- tmux session name and stable Bitveins session identity;
- window id, index, and name;
- pane id, pid, title, path, and dead/alive state;
- optional pane-scoped Bitveins label;
- enough process information to resolve the foreground process group.

Simple `pane_current_command` matching is insufficient. Node-based agents often
appear as `node` or a renamed process, and an agent may temporarily place a tool
process in the foreground. Detection therefore inspects the foreground process
group and its ancestry up to the pane process.

The first supported process manifests should cover Codex, Hermes, Claude Code,
OpenCode, Gemini CLI, Cursor Agent, GitHub Copilot CLI, and Aider. Unknown
terminal programs remain ordinary terminal panes and do not become agent rows.

### Status authority

The target model follows the same principle documented by Herdr:

1. identify the foreground agent process;
2. use complete lifecycle hooks when an integration can author every relevant
   transition;
3. otherwise classify a recent bottom-buffer snapshot using agent-specific
   screen rules;
4. use terminal title and progress sequences only as supporting evidence;
5. fall back to `idle` or `unknown` rather than declaring a false blocker.

Current Bitveins integrations already provide useful lifecycle events:

- Hermes: input required, permission required, completed, and failed;
- Codex: permission required and completed.

The Agent Inbox is an event log, not a current-state registry. A mature version
should keep current agent presence/state separately and use Inbox events for
attention history and notifications.

The first tmux implementation may use bundled conservative screen rules while
the lifecycle-state registry is introduced. Blocked and failed matching must be
strict and limited to the live bottom of the terminal to avoid classifying old
transcript content.

### Identity and renaming

The tmux pane is the initial live identity boundary. A pane-scoped tmux user
option can hold the custom display label without introducing database drift.
The label survives browser reconnects and session renames for the life of the
pane.

Longer term, integrations can provide native agent session ids. Those ids allow
labels and state to follow an agent across a native resume rather than only
across a browser reconnect.

### Navigation

Agent navigation resolves in this order:

```text
stable Bitveins session id
  -> current tmux session name
  -> stable tmux window id
  -> current window index
  -> pane id
```

Bitveins already supports stable session/window links. Agent navigation extends
the final step by explicitly selecting and focusing the target pane. The pane
remains authoritative in tmux, and the corresponding HTML terminal receives
browser focus after the native selection succeeds.

### Refresh and delivery

The server should cache an inventory scan briefly so multiple browser clients do
not multiply `ps` and `capture-pane` work. A polling client is acceptable for
the first implementation. The mature model should publish inventory and state
deltas over the existing authenticated WebSocket after an initial snapshot.

## Long-term: selectable multiplexer runtime

### Herdr API findings

Herdr exposes a versioned local JSON socket API with an exportable schema. Its
documented control surface includes:

- session snapshots and event subscriptions;
- workspace, worktree, tab, and pane management;
- pane split, move, swap, zoom, focus, resize, layout, input, and reads;
- foreground process information;
- agent detection, state, identity, rename, prompt, start, focus, and waits;
- integration and plugin management;
- live layout, pane, scroll, output, and agent-state events.

Most importantly for Bitveins, Herdr exposes public live terminal bridges:

- `herdr terminal session observe` streams read-only ANSI frames;
- `herdr terminal session control` streams ANSI frames and accepts input,
  resize, scroll, and release commands.

Frames are newline-delimited JSON with base64-encoded ANSI bytes. That is enough
for a Bitveins server adapter to relay Herdr terminals into the existing xterm
rendering path.

Official references:

- <https://herdr.dev/docs/socket-api/>
- <https://herdr.dev/docs/cli-reference/#direct-terminal-attach>
- <https://herdr.dev/docs/agents/>
- <https://herdr.dev/docs/concepts/>

### Herdr is not a drop-in tmux replacement

Herdr is not tmux protocol-compatible and does not expose every historical tmux
option, hook, buffer, key table, format, or client behavior. It does expose
enough for the Bitveins product surface and adds semantic agent operations that
tmux does not have.

The model maps cleanly but not literally:

| Bitveins concept | tmux provider | Herdr provider |
| --- | --- | --- |
| runtime namespace | tmux server/socket | named Herdr session |
| project container | tmux session | Herdr workspace |
| tab | tmux window | Herdr tab |
| terminal | tmux pane | Herdr pane |
| live stream | tmux control mode | Herdr terminal session stream |
| agent state | Bitveins detection/integrations | Herdr AgentInfo/events |

Herdr owns its own PTYs. Selecting the Herdr provider does not adopt, migrate,
or upgrade existing tmux panes. The two providers expose different live fleets.
Declarative Herdr layout restore can recreate structure and commands, but it
does not preserve live PTYs or running processes.

### Required Bitveins abstraction

The current code names and contracts expose tmux details throughout session and
terminal application services. Supporting Herdr requires neutral provider
contracts rather than conditional branches spread across the UI:

```text
MultiplexerGateway
├─ TmuxMultiplexerGateway
└─ HerdrMultiplexerGateway

TerminalStreamFactory
├─ TmuxTerminalStreamFactory
└─ HerdrTerminalStreamFactory
```

Neutral resources should have provider-owned opaque ids:

- `MultiplexerWorkspace`
- `MultiplexerTab`
- `MultiplexerPane`
- `MultiplexerLayout`
- `AgentPresence`

The tmux adapter may continue translating these resources to the current public
session/window routes during migration. Provider-specific operations should be
reported as capabilities so the UI can hide unsupported actions without
guessing from a provider name.

### Controller ownership

Herdr permits multiple observers but only one controller for a terminal. A
Bitveins Herdr adapter therefore needs an explicit lease model:

- the active writable browser client owns control;
- secondary tabs and passive clients observe;
- takeover is a deliberate user action;
- disconnect and background expiry release ownership;
- resize authority follows the active controller.

This differs from tmux multi-client behavior and must be tested before a full
provider refactor.

### Configuration and security

The provider is server infrastructure, not merely an appearance preference.
The first configuration should be deployment-scoped:

```text
BITVEINS_MULTIPLEXER=tmux
BITVEINS_MULTIPLEXER=herdr
```

A later UI may switch among several configured runtimes, but it must make clear
that each runtime has a separate terminal fleet.

The Herdr socket is privileged: its API can control terminals, stop the server,
and manage integrations. The socket must never be forwarded directly to the
browser. Bitveins should expose only its authenticated and validated API, apply
protocol-version checks, and tolerate unknown response fields.

### What Herdr would and would not provide automatically

A Herdr provider would immediately supply backend information for semantic
agent state, layouts, worktrees, waits, and native session identity. It would
not automatically add Herdr's TUI, popup presentation, plugin interfaces,
keybindings, remote-client behavior, or every workflow to Bitveins. Each desired
capability still needs an intentional Bitveins interaction and security review.

## Recommended sequence

### Phase 1: tmux agent awareness

- global pane/process discovery;
- conservative state classification;
- sidebar tree, rename, and direct pane navigation;
- desktop and mobile coverage;
- no change to the tmux runtime boundary.

### Phase 2: durable current-state service

- lifecycle start/working reports for installed integrations;
- state authority and sequence rules;
- WebSocket snapshots/deltas;
- done-versus-seen behavior and notification rollups;
- explain output for misclassified panes.

### Phase 3: Herdr bridge experiment

- read a Herdr session snapshot;
- render one pane through `terminal session observe`;
- validate ANSI fidelity, reconnect, scroll, and resize;
- promote one client to `control` and test ownership/takeover;
- compare Async reliable input and image-paste behavior.

### Phase 4: provider-neutral domain

- extract neutral workspace/tab/pane contracts;
- move tmux behavior behind a provider adapter;
- add a capability-negotiated Herdr adapter;
- preserve provider identity in routes, history, notifications, and settings.

### Phase 5: optional multi-runtime UI

- show configured runtimes explicitly;
- prevent implied live migration;
- expose Herdr-native agent/worktree capabilities incrementally;
- retain tmux as a first-class, independently tested provider.

## Decision boundary

The near-term tmux agent tree is a contained product feature. A Herdr provider is
a credible long-term upgrade, but it becomes worthwhile only after a bridge
prototype proves terminal fidelity and controller ownership. The provider
refactor should not begin merely to obtain agent colors; tmux-native discovery
can deliver that value without destabilizing the existing terminal runtime.
