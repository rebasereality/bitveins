# Bitveins Notifications for Hermes

User plugin connecting Hermes lifecycle hooks to the local Bitveins Attention API.

## Installation

Install the bundled plugin from a native Bitveins release:

    bitveins hermes install

This installs into the `default` Hermes profile. For another existing profile,
use `bitveins hermes install --profile <name>`. Then restart the matching Hermes
Gateway and open a new CLI session so every Hermes surface loads the plugin.

## Notifications

- `pre_approval_request` on manual/CLI/Gateway approval: `permission_required`
- `pre_tool_call` for `clarify`: `input_required`
- successful parent turn that used at least one tool: `completed_with_tools`
- successful parent text response without tool use: `completed_without_tools`
- failed, non-interrupted parent turn: `failed`

Bitveins filters these typed signals before creating an Agent Inbox event or Web Push. The existing mapping is enabled by default; `completed_without_tools` is disabled by default and can be enabled under Settings → Notifications. Smart-mode approvals, deliberate interruptions and delegated child completions remain silent.

## Privacy and security

The plugin sends only a fixed lifecycle classification, its matching event type, and validated tmux window/pane IDs when available. Bitveins constructs every user-facing title on the server. Prompts, responses, titles, summaries, session names, tool arguments, commands, endpoints, and tokens are never transmitted by the plugin.

The integration endpoint is fixed to `127.0.0.1`. Redirects and environment proxies are disabled. The token and port are read without shell evaluation from the canonical private regular file `~/.config/bitveins/env`; environment variables cannot override this path. Both the directory and file must be owned by the current user and inaccessible to group/other users.

Hook delivery uses one bounded background worker. Lifecycle state, completed-turn deduplication, and child-session tracking are also bounded and cleaned on session reset/finalization. A full queue, HTTP failure or tmux failure is best-effort and never interrupts or delays Hermes. Only tmux window/pane IDs matching `@<digits>` and `%<digits>` can be sent. Session names, current working paths, and project basenames are never collected or transmitted.

## Activation

The installer enables `bitveins-notifications` in the selected Hermes profile. A new CLI session or Gateway restart is required after installation or updates.

Set `BITVEINS_NOTIFICATIONS=0` for a Hermes process to disable delivery from that process without uninstalling the plugin.

## Verification

From a Bitveins source checkout, run:

    python3 -m unittest -v integrations/hermes-notifications/test_plugin.py
