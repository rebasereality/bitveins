# Changelog

All notable changes to Bitveins are documented here. The project follows
[Semantic Versioning](https://semver.org/) and keeps an `Unreleased` section
until a release is tagged.

## Unreleased

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
