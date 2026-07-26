# Bitveins

Async Terminal PWA for managing local `tmux` sessions through Nuxt 4, Nitro
WebSockets, `node-pty`, and xterm.js.

Bitveins is a single-user administrative tool: unlocking it grants the Unix
permissions of the account running the service. It is not a multi-tenant
sandbox.

<p align="center">
  <a href="https://rebasereality.com/bitveins/media/bitveins/overview-desktop.webp">
    <img src="https://rebasereality.com/bitveins/media/bitveins/overview-desktop.webp" alt="Bitveins desktop overview" width="72%">
  </a>
  <a href="https://rebasereality.com/bitveins/media/bitveins/hero-mobile-codex.webp">
    <img src="https://rebasereality.com/bitveins/media/bitveins/hero-mobile-codex.webp" alt="Bitveins mobile Codex session" width="24%">
  </a>
</p>

## Modes

- **Async** is the default. Type in the native textarea and send a complete command or multi-line block with Enter. This is best for high-latency mobile links because local editing stays responsive.
- **Live** forwards xterm keystrokes directly to the PTY. Use it for Codex `$` skill menus, `@` file pickers, shells, editors, and other interactive terminal apps.

## Explorer and terminal file links

Explorer opens text files and authenticated raster previews directly from the
selected session workspace. Images remain in their project: Bitveins does not
copy them to `public/` or rebuild itself to display them.

Paths printed in xterm become discoverable without changing ordinary terminal
mouse behavior:

- hold `Ctrl` on Linux/Windows or `Cmd` on macOS to reveal an available path;
- click while holding that modifier to open the file in Explorer;
- when the same relative path exists in several nested projects, choose its
  root explicitly;
- optionally remember that root for the current tmux window, or change, forget
  or clear remembered roots from the `Path links` menu;
- on touch devices, long-press and drag to select a path, then use
  `Open in Explorer`; paths split across terminal display lines are
  reconstructed before resolution, and tapping the terminal never summons the
  virtual keyboard.

On mobile in Live mode, the virtual keyboard is explicit. Use the keyboard
icon immediately after `Reorder` to open or close Gboard (or its equivalent).
Terminal taps, text selection, modifiers and one-tap terminal controls never
open it implicitly; modifiers and terminal controls preserve it when it is
already open.

The mobile Async drawer starts empty for every tmux window. Bitveins never
silently restores an old draft into a different conversation; the last sent
command remains available only through the explicit restore action.

Supported previews are PNG, JPEG, GIF, WebP and AVIF up to 50 MiB. SVG and
other active formats are never rendered as images. Text files open at the
reported `:line[:column]` when present.

## Supported platform

- Linux x86_64 with kernel 4.18+ and glibc 2.34+
- systemd with user services
- `tmux`

The native release includes its own Node runtime and compiled modules. End
users do not need Node, pnpm, Git or native build tooling.

## Native installation

Download and inspect the bootstrap, then run it as the Unix user who owns the
tmux sessions:

```bash
curl -fsSLO https://github.com/rebasereality/bitveins/releases/latest/download/install.sh
less install.sh
sh install.sh
```

The installer downloads versioned release assets over HTTPS, verifies their
SHA-256 checksum and Sigstore build provenance, asks for a Bitveins password
twice without echoing it, creates the session secret, installs a systemd user
service and checks `http://127.0.0.1:3000/api/auth/session`. If Cosign is not
already installed, the bootstrap downloads one pinned Cosign build and verifies
its digest before use. A missing or invalid provenance bundle stops the
installation; the checksum is never treated as proof of origin.

For a version-pinned or fully manual installation, see
[`docs/installation.md`](docs/installation.md).

Bitveins deliberately refuses:

- installation as `root`;
- an empty or weak password;
- production startup without authentication secrets;
- a production bind other than `127.0.0.1`.

The local UI is then available at `http://127.0.0.1:3000`. Put an authenticated
TLS tunnel or reverse proxy in front of that loopback listener before using it
remotely.

## Product CLI

```bash
bitveins help
bitveins install --help
bitveins start
bitveins stop
bitveins status
bitveins doctor
bitveins logs --follow
bitveins restart
bitveins password
bitveins update
bitveins uninstall
bitveins version
```

`bitveins password` rotates the Scrypt hash and revokes existing browser
sessions. `bitveins uninstall` preserves configuration and history by default;
`bitveins uninstall --purge` requires an additional interactive confirmation.
Every command supports `bitveins <command> --help`. Expected failures are
concise; append `--verbose` to include redacted diagnostic causes.

CLI exit codes are stable:

| Code | Meaning |
| ---: | --- |
| 0 | success |
| 1 | unexpected operation or transaction failure |
| 2 | invalid command or arguments |
| 3 | `doctor` found an unhealthy installation |
| 4 | missing prerequisite, invalid configuration or unavailable service |
| 5 | release integrity or provenance failure |

The default installation uses:

```text
~/.local/bin/bitveins
~/.local/lib/bitveins/
~/.config/bitveins/env
~/.config/systemd/user/bitveins.service
~/.local/share/bitveins/history.sqlite
```

To keep the user service running after logout, enable systemd lingering:

```bash
sudo loginctl enable-linger "$USER"
```

This optional command is intentionally not executed silently by the installer.

## Development

The source checkout and pnpm commands are contributor tools, not the public
installation path. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local setup and
quality gates.

## System Architecture

```mermaid
flowchart LR
    Client["Browser / PWA"] --> Controller["Connection controller + state machine"]
    Controller -->|typed WebSocket messages| WSRoute["/api/ws"]
    Client -->|REST| Routes["Nitro routes"]
    WSRoute --> Container["Composition root"]
    Routes --> Container
    Container --> Dropzones["Dropzones module"]
    Container --> Sessions["Sessions module"]
    Container --> History["History module"]
    Container --> Explorer["Explorer module"]
    Container --> Terminal["Terminal peer module"]
    Routes --> Files["Typed file handlers"]
    Explorer --> Files
    Sessions --> Tmux["tmux CLI adapter"]
    Sessions --> SQLite[("SQLite repository")]
    Dropzones --> SQLite
    History --> SQLite
    Files --> Sessions
    Terminal --> PTY["node-pty adapter"]
    PTY --> TmuxServer["tmux server"]
    Tmux --> TmuxServer
```

The server is organized by functional module under `server/modules/`.
Application services depend on narrow ports; concrete tmux, SQLite and PTY
adapters are wired in `server/composition/`, while stateless file routes use
typed handler factories. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for lifecycle,
test-isolation and dependency details.

## API Surface

- `GET /api/sessions` lists tmux sessions.
- `POST /api/sessions` creates a detached tmux session with `{ "name": string, "path": string }`.
- `DELETE /api/sessions/:name` kills a tmux session.
- `GET /api/sessions/:name/history` lists saved async input messages for a tmux session, newest first.
- `POST /api/sessions/:name/history` saves `{ "message": string }` to that session's async input history.
- `GET /api/sessions/:name/files/metadata` classifies a confined workspace document.
- `GET /api/sessions/:name/files/image` streams a confined, allowlisted raster image.
- `POST /api/sessions/:name/files/resolve` resolves a bounded batch of terminal file references.
- `GET /api/sessions/:name/files/roots` lists bounded project-root choices.
- `POST /api/auth/login` unlocks the app with `{ "password": string }`.
- `POST /api/auth/logout` clears the sealed session.
- `GET /api/auth/session` reports whether the browser is unlocked.
- `WS /api/ws` uses the sealed session cookie and accepts terminal attach, live input, reliable async input, resize, heartbeat, and detach actions. Reliable async inputs are acknowledged and deduplicated across reconnects.

Detach only kills the local `tmux attach-session` PTY process. It leaves the underlying tmux session alive.
