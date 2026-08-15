# Bitveins

Async-first Web Terminal and PWA for managing local `tmux` sessions on mobile and desktop, built with Nuxt 4, Nitro WebSockets, `node-pty`, and xterm.js.

Bitveins provides a fluid mobile experience over high-latency connections, integrates with local AI coding agents (Codex, Hermes, Antigravity), and notifies you via Web Push when commands or agents need attention.

<p align="center">
  <a href="https://rebasereality.com/bitveins/media/bitveins/overview-desktop.webp">
    <img src="https://rebasereality.com/bitveins/media/bitveins/overview-desktop.webp" alt="Bitveins desktop overview" width="72%">
  </a>
  <a href="https://rebasereality.com/bitveins/media/bitveins/hero-mobile-codex.webp">
    <img src="https://rebasereality.com/bitveins/media/bitveins/hero-mobile-codex.webp" alt="Bitveins mobile session" width="24%">
  </a>
</p>

---

## Features

- **Async Input Mode (Default)**: Type in a native multi-line textarea with full mobile editing, autocomplete, and gestures. Dispatch complete commands in one go without sluggish roundtrips over high-latency mobile networks.
- **Multi-Device Prompt Sync**: Live WebSocket synchronization of prompt drafts across all connected devices (desktop, phone, tablet) with SQLite draft persistence per tmux window.
- **Live Interactive Mode**: Full xterm.js terminal with direct PTY forwarding for interactive TUIs, Vim/Neovim, interactive menus, and real-time prompts.
- **Automatic Agent Discovery & Status**: Detects AI agents (*Antigravity, Codex, Hermes, Claude, Grok, Gemini, Cursor, Copilot, Aider, Pi*) with visual state indicators (working, waiting, failed, idle) directly on tmux tabs and sidebar.
- **Agent Inbox & Web Push**: Receive push notifications on your phone or desktop when background tasks, scripts, or AI coding agents require permissions, complete a turn, or fail. Clicking a notification brings you right back into the exact tmux window.
- **Git Graph & Diff Viewer**: Built-in interactive SVG Git commit graph and side-by-side file diffs in the workspace explorer.
- **Interactive Tmux Splits**: Horizontal and vertical pane layouts with drag resizing, touch scrolling, and focused pane navigation.
- **Workspace Explorer & File Links**: Click or tap file paths in terminal output to view source code or preview images (PNG, JPEG, GIF, WebP, AVIF) directly in the browser.
- **Installable PWA**: Install to Home Screen on iOS and Android for a fullscreen native-like experience with custom mobile keyboard and terminal controls.
- **Secure & Loopback-Isolated**: Runs as a single-user daemon bound exclusively to `127.0.0.1`, protected by Scrypt password hashing and sealed session cookies.

---

## Quick Start (Native Installation)

### Prerequisites

- **OS**: Linux x86_64
- **Tools**: `tmux` 3.1+ and `systemd` (user services)

### Install

Run the interactive installer as the Unix user who owns the tmux sessions:

```bash
curl -fsSL https://github.com/rebasereality/bitveins/releases/latest/download/install.sh | sh
```

*Or download and inspect the bootstrap script before running:*

```bash
curl -fsSLO https://github.com/rebasereality/bitveins/releases/latest/download/install.sh
sh install.sh
```

The installer will:
1. Download and verify the authenticated standalone release package (self-contained Node runtime included — no global Node or pnpm required).
2. Prompt you to set your administrative password.
3. Generate session and VAPID push secrets in `~/.config/bitveins/env` (`0600`).
4. Install and start a systemd user service at `http://127.0.0.1:3000`.

To ensure the service stays running after you log out of SSH, enable systemd lingering:

```bash
sudo loginctl enable-linger "$USER"
```

---

## Remote Access & PWA Setup

For security, Bitveins only binds to loopback (`127.0.0.1:3000`). To access it remotely from your phone or laptop, put a secure HTTPS tunnel or reverse proxy in front of it:

- **Cloudflare Tunnel**:
  ```bash
  cloudflared tunnel --url http://127.0.0.1:3000
  ```
- **Tailscale**:
  ```bash
  tailscale serve --bg 3000
  ```
- **Reverse Proxy (Caddy, Nginx, Traefik)**: Forward HTTPS traffic with WebSocket support to `127.0.0.1:3000`.

> **Note**: HTTPS is required by browsers to enable Web Push notifications and PWA Home Screen installation.

---

## CLI Management

Bitveins ships with a built-in CLI tool to manage your installation:

```bash
# Service lifecycle
bitveins status          # Check service health and state
bitveins restart         # Restart the systemd user service
bitveins logs --follow   # Tail live daemon logs
bitveins doctor          # Run environment and health diagnostics

# Configuration & Maintenance
bitveins update          # Atomically update to the latest release
bitveins password        # Interactively rotate password and invalidate sessions
bitveins uninstall       # Remove installation (use --purge to wipe database/config)
```

---

## Agent & Script Integrations

### AI Agent Plugins

Bitveins includes zero-dependency lifecycle notification plugins for AI coding agents:

```bash
# Claude / Codex lifecycle hooks
bitveins codex install

# Hermes Agent plugin
bitveins hermes install

# Antigravity CLI integration
bitveins antigravity install
```

### Custom Shell & Script Notifications

Send custom events to the Agent Inbox and phone push notifications from your own scripts or build pipelines:

```bash
# Post an event
bitveins event \
  --type completed \
  --source local-script \
  --title "Build finished" \
  --summary "Docker image built and pushed successfully." \
  --project MyProject
```

---

## Development & Self-Hosting from Source

If you want to contribute or build Bitveins from source:

### Prerequisites

- **Node.js**: 24+
- **pnpm**: 10+
- **tmux**: 3.1+
- C++ build tools (for `node-pty` native compilation)

### Setup

```bash
# 1. Clone repo & install dependencies
git clone https://github.com/rebasereality/bitveins.git
cd bitveins
pnpm install

# 2. Configure environment
cp .env.example .env
pnpm build:cli

# 3. Generate credentials
pnpm bitveins hash-password
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
# Fill BITVEINS_AUTH_PASSWORD_HASH and NUXT_SESSION_PASSWORD into .env

# 4. Start development server
pnpm dev
```

Open `http://127.0.0.1:3000` to start developing.

---

## Documentation

- [Detailed Installation & Verification Guide](docs/installation.md)
- [System Architecture](ARCHITECTURE.md)
- [Threat Model & Security](docs/threat-model.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

---

## License

[MIT](LICENSE)
