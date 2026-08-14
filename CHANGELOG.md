# Changelog

All notable changes to Bitveins are documented here. The project follows
[Semantic Versioning](https://semver.org/) and keeps an `Unreleased` section
until a release is tagged.

## 1.6.0 - 2026-08-14

### Added

- real-time multi-device Async prompt sync and per-tmux-window drafts: the Async
  prompt composer now synchronizes live across all connected devices (browsers, mobile,
  workstations) via WebSockets without typing lag, persists drafts per tmux window tab
  in SQLite across tab switches and restarts, features cross-device focus arbitration
  where inactive devices display a grayed-out live preview of the draft and automatically
  transfer focus and adapt terminal window geometry (`resize-window`) on tap/click, and
  clears drafts upon prompt submission;
- agent status indicator squares on tmux window tabs: the colored state square
  (working, blocked, failed, idle) is now rendered directly in front of the window
  tab name when an agent is running in that tmux window;
- Antigravity agent integration: automatic discovery of Antigravity (`agy` / `antigravity`)
  processes in the sidebar with dynamic conversation title and preview resolution from
  `conversation_summaries.db`, native lifecycle hook notifications (`bitveins antigravity install` / `~/.gemini/config/hooks.json`),
  and customizable notification preferences in the Settings modal;
- minimal Grok Build integration: automatic discovery of Grok Build panes in the
  sidebar (across `grok` binary, platform download names, and `~/.grok/bin/agent`)
  with dynamic session title resolution from `session_search.sqlite`, light/dark theme
  adaptation (`LC_GROK_APPEARANCE`, OSC 11, and 256-color palette remapping) and mouse-wheel
  scrolling in Grok's TUI (without hook-based lifecycle notifications);
- a Fullscreen control after the pane-split buttons, which puts Bitveins in
  browser fullscreen and hides the session sidebar so only the session navbar,
  terminal and Async/Live composer remain.

### Fixed

- Antigravity screen status classification: terminal captures now strip ANSI escape sequences,
  support the full Unicode Braille spinner range, recognize Antigravity cancel bars (`esc to cancel`),
  and inspect active footer lines to avoid sticky working-state false positives from past conversation text;
- Antigravity agent label resolution: initial user prompts are now resolved directly from active
  `transcript.jsonl` files before summaries are flushed to `conversation_summaries.db`, and stale/generic
  titles from other shells or previous agent runs are filtered out;
- single-line prompt submissions from Async mode now use bracketed paste mode so
  prompts paste instantaneously instead of being typed character-by-character;

- background Bitveins tabs no longer keep a live tmux stream or paint Grok
  frames, which could grow until Chrome killed the tab. Hidden tabs detach and
  resume from a fresh snapshot when they become visible again;
- mouse-wheel scrolling in Grok Build's TUI reaches the app again after a
  terminal snapshot, instead of being dropped between xterm and tmux;
- Grok Build follows Bitveins light and dark mode: the web terminal advertises
  truecolor, answers OSC 11 in Async mode, stamps `LC_GROK_APPEARANCE`, and
  remaps GrokNight's 256-color surfaces so light mode stays readable.

## 1.5.0 - 2026-08-13

### Added

- a read-only Git Graph drawer with a resizable, theme-aware commit graph,
  expandable commit metadata and changed-file lists, plus side-by-side diffs
  opened directly in Explorer tabs;
- automatic discovery of Codex, Hermes, Claude, OpenCode, Gemini, Cursor,
  Copilot, Aider and Pi agents across every tmux session, window and pane;
- agent rows nested below their owning session, with theme-aware working,
  waiting, failed and idle indicators, persistent custom names and direct
  navigation to the exact tmux pane;
- subtle sidebar highlighting for the active session tree and the agent in the
  current tmux window, with instance-name truncation and the agent type kept
  visible at the right edge;
- Codex agent labels resolved locally from the thread name or first-message
  preview shown by Codex `/resume`, with tmux titles retained as a fallback;
- repository and branch context grouped beneath each agent name, including
  linked-worktree and detached-HEAD detection;
- per-session notification controls directly in the desktop sidebar and mobile
  session drawer, sharing the same device-specific mute state as the terminal
  navbar;
- a documented long-term path toward lifecycle-backed agent state and an
  optional provider-neutral Herdr integration.

### Changed

- Git history now follows the active tmux window's current directory, so the
  viewer works inside a repository even when the session started elsewhere and
  no agent is running;
- commit lanes are rendered as one continuous SVG graph with smooth, rounded
  branch transitions that remain connected when commit details expand;
- the desktop session sidebar is wider, while its mobile drawer now fills the
  viewport, removes the drag handle and exposes an explicit close action;
- Nuxt, Nuxt UI, CodeMirror and the supporting runtime, build and test
  dependencies have been refreshed to their current compatible versions.

### Fixed

- opening the Git drawer keeps the terminal visible beneath its overlay while
  terminal input remains safely suspended;
- synchronized side-by-side diffs now expose a visible, theme-aware scrollbar;
- opening the new-session dialog from Live mode focuses its name field without
  leaking typed characters or modifier shortcuts into the terminal;
- release smoke checks accept the Service Worker event-listener syntax emitted
  by updated build dependencies while continuing to require Web Push handlers.

## 1.4.0 - 2026-08-11

### Added

- interactive tmux pane layouts with horizontal and vertical splits, focused
  pane selection, close controls, drag resizing and an accent-colored active
  pane border;
- one-finger line-by-line terminal scrolling on touch devices, with natural
  swipe direction and tmux mouse-mode support;
- per-device notification mute controls for each session, shared across browser
  tabs and applied to both Web Push and the local Agent Inbox;
- session and tmux window context in detailed Web Push notifications and Agent
  Inbox entries.

### Changed

- terminal clients now attach to individual tmux panes so desktop and mobile
  views can mirror the same layout while the active client controls its size;
- session notification mute controls now appear only when Web Push is enabled
  on the current device.

### Fixed

- newly created panes display their shell prompt immediately and retain stable
  tmux-native scrolling and exact terminal geometry while layouts are polled;
- Live image pastes target the focused pane, and the mobile Live controls no
  longer cover the terminal's bottom rows.

## 1.3.0 - 2026-08-05

### Added

- Agent Inbox for persistent attention events linked to the exact tmux session
  and window that needs attention;
- privacy-safe Web Push subscriptions, per-device detail controls, diagnostics
  and notification tests;
- `bitveins event` for creating authenticated local Agent Inbox events from
  commands and scripts without reusing browser credentials;
- optional Hermes Agent lifecycle notifications for input, permission,
  completed parent turns and failures, with global controls per event class;
- `bitveins hermes install [--profile <name>]` for securely installing and
  activating the bundled Hermes plugin;
- optional Codex lifecycle notifications for permission requests and completed
  parent turns, with persistent controls per event class and a bundled local
  plugin;
- `bitveins codex install` for securely installing and activating the bundled
  Codex marketplace plugin;
- one-click dismissal of all visible Agent Inbox events;
- stable, browser-native permalinks and history for sessions, terminal windows
  and Explorer paths;
- `Ctrl`/`Cmd` terminal links for HTTP(S) URLs and bare IPv4 addresses, opened
  in a separate browser tab.

### Changed

- native release archives now bundle and verify the Codex and Hermes lifecycle
  plugins so installations never require a source checkout;
- the installer now creates and preserves the local integration token and VAPID
  identity used by Agent Inbox and Web Push;
- agent lifecycle preferences are grouped by integration, while notification
  detail visibility remains private to each subscribed device;
- time-sensitive input and permission notifications are delivered ahead of
  routine completion events.

### Fixed

- unavailable or reserved helper deep-link targets no longer attach an
  unrelated tmux session;
- legacy database files are hardened to owner-only permissions on startup;
- previously installed PWAs using `/?source=pwa` load sessions normally and
  canonicalize to the home route.

## 1.2.0 - 2026-08-03

### Added

- Async terminals now forward wheel input to mouse-aware applications and tmux
  scrollback while continuing to block direct keyboard input;
- terminal output adapts Hermes response text to the active color scheme.

### Changed

- Async submissions now leave tmux copy mode before delivery and use
  attachment-aware acknowledgements across reconnects;
- passive Terminal and Explorer navigation preserves the current scrollback
  viewport.

### Fixed

- yellow terminal output remains legible in light mode, including the extended
  ANSI colors used by Hermes;
- Hermes response text remains legible against the dark terminal background;
- new tmux windows can be created when a session and its current window share
  the same name, with failures now surfaced in the session sidebar;
- tapping or focusing the mobile Async editor commits the selected command
  history preview before editing.

## 1.1.0 - 2026-07-27

### Added

- rendered Markdown previews with safe internal workspace links and images;
- SVG previews that can be toggled back to the editable source;
- in-browser video playback backed by authenticated byte-range streaming;
- Explorer previews for additional browser image formats and TIFF conversion;
- download actions in the Explorer toolbar, file tree and tab context menus;
- middle-click tab closing, matching common browser tab behavior.

### Changed

- Explorer tabs now live inside the document pane so the file tree uses the
  full workspace height;
- unsupported binary documents open in a useful download-only view;
- native release verification now covers the Sharp runtime and its libvips
  dependency;
- session loading uses compact session-shaped placeholders and only shows the
  empty state after loading completes.

### Fixed

- the global Download dialog now submits the path entered by the user;
- Async prompt drafts survive switching between Terminal and Explorer;
- the Explorer tree header now matches the tab-bar height;
- the active Preview control remains legible across accent palettes.

## 1.0.0 - 2026-07-26

### Added

- a compact terminal-first desktop and mobile interface with independent
  appearance profiles for interface, terminal and prompt sizing;
- configurable accent palettes, prompt typography and live previews;
- Transfer sessions that open directly in Explorer and a global upload grid
  with Current prompt support and progress feedback;
- account-menu links to the official documentation and GitHub repository;
- native Linux x86_64 release artifacts with a bundled Node runtime;
- the `bitveins` product CLI for install, lifecycle, diagnostics, password
  rotation, atomic update/rollback and safe uninstall;
- a systemd user service, reviewed bootstrap, release checksums and public
  build provenance;
- mandatory Sigstore verification bound to the official repository, release
  workflow, version tag, source commit and packaged release manifest;
- deny-by-default API authentication and centralized workspace confinement;
- shared runtime contracts for REST and WebSocket boundaries;
- production environment validation, coverage gates and Playwright CI smoke;
- security policy, threat model and reproducible toolchain metadata;
- a dedicated CLI/release coverage gate with critical per-file thresholds.
- an Explorer for text and raster workspace documents, including fit/zoom image
  previews served without copying project assets into Bitveins;
- `Ctrl`/`Cmd` terminal file links with bounded multi-root resolution,
  ambiguity choices and opt-in per-tmux-window root preferences.

### Changed

- Live controls can be reordered and persist their order across reloads;
- settings replace the terminal workspace while preserving the session sidebar;
- the product, CLI, environment contract, release artifacts, helper sessions,
  service and persistent paths are now consistently named Bitveins;
- production now refuses non-loopback binding and installer-generated passwords
  are mandatory before first start;
- end-user installation no longer requires Git, Node or pnpm;
- Nuxt-aware type checking replaces the ineffective root `vue-tsc` invocation;
- the CodeMirror editor is loaded asynchronously;
- the former IDE label and state are now Explorer, with migration of the legacy
  browser preference and preservation of the mounted terminal connection;
- REST errors and tmux error responses use shared normalization helpers;
- the product CLI now uses a command registry, typed errors and stable exit
  codes, ports/adapters and an explicit installation transaction;
- native build, verification and smoke scripts are TypeScript-checked and
  share release, manifest, archive, ELF, license and timestamp utilities;
- release retention follows explicit activation history instead of mtimes;
- attested Linux releases are built and verified against the documented
  glibc 2.34 ABI ceiling.

### Removed

- the unsupported Docker distribution path.

### Fixed

- mobile Live input now forwards printable characters, Backspace, Enter and
  navigation controls across native keyboard event variants, including Gboard;
- the account menu now remains above the desktop prompt;
- session rename, window creation, history state, file-tree typing and mobile
  live-modifier event mismatches.
- Explorer file tabs now activate on body click instead of closing.
- mobile terminal taps, selection and Live modifiers no longer summon the
  virtual keyboard; a dedicated button after `Reorder` now controls it.
- the mobile `Open in Explorer` selection action now re-evaluates every changed
  xterm selection and remains available after returning from Explorer.
- mobile Async input no longer hydrates stale local drafts or carries editor
  text into another tmux window; creating a window now selects its conversation
  scope before attaching the terminal.
- the mobile Explorer control is icon-only while retaining its accessible name.
- selected paths hard-wrapped across terminal display rows are reconstructed
  and resolved as a complete reference before shorter fallback fragments.
