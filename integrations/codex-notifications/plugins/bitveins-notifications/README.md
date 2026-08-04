# Bitveins Notifications for Codex

Codex plugin connecting privacy-safe lifecycle hooks to the local Bitveins
Attention API.

Install the bundled plugin from a native Bitveins release:

    bitveins codex install

Start a new Codex session, open `/hooks`, and trust the plugin hook definition.
Codex deliberately requires this review after installation and after hook
updates.

## Notifications

The plugin emits the lifecycle signals Codex currently exposes reliably:

- permission requests;
- completed parent turns with an observed local tool call;
- completed parent turns without an observed local tool call.

Codex does not currently expose distinct clarification-request or failed-turn
hooks. The plugin does not guess those states from assistant text or transcript
contents. Hosted tools that bypass the local function-tool hook path may not be
counted as tool use. Subagent completions and stop events without an assistant
message stay silent.

Bitveins filters these typed signals before creating an Agent Inbox event or
Web Push. Completed tool turns and permission requests are enabled by default;
text-only responses are disabled by default and can be enabled under
Settings -> Notifications.

## Privacy and failure behavior

Only a fixed lifecycle classification and validated tmux window/pane IDs are
sent. Prompts, responses, session names, working directories, tool arguments,
commands, model names, transcript paths, endpoints, and tokens are never sent.
Bitveins resolves the linked session locally from the tmux window ID and
suppresses signals that do not resolve to exactly one non-helper session.

The endpoint is fixed to `127.0.0.1`. Redirects and environment proxies are
disabled. The token, port, and optional `BITVEINS_TMUX_SOCKET_NAME` are read
without shell evaluation from the canonical private regular file
`~/.config/bitveins/env`; environment variables cannot override this path.
The current tmux socket must match Bitveins' configured socket.

Delivery is best-effort with a short timeout and never changes a hook decision.
State files contain only opaque hashes and empty marker files in Codex's
plugin-data directory. They are bounded and cleaned automatically.
