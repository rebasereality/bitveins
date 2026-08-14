# Bitveins Antigravity Notifications

This integration hooks into Antigravity (`agy` / `antigravity`) lifecycle events and emits structured attention events to your local Bitveins server.

## Features

- Emits `input_required` when `ask_question` tool is called.
- Emits `completed_with_tools` or `completed_without_tools` on turn completion.
- Emits `failed` when an error occurs during execution.
- Auto-detects active tmux session and pane.
- Zero network exposure: only connects to loopback `127.0.0.1`.

## Installation

Install using the Bitveins CLI:

```bash
bitveins antigravity install
```
