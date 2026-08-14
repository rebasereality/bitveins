"""Privacy-safe Antigravity lifecycle notifications for local Bitveins."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable, NamedTuple

_SOURCE = "antigravity"
_WINDOW_PATTERN = re.compile(r"^@\d+$")
_PANE_PATTERN = re.compile(r"^%\d+$")
_SOCKET_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
_HTTP_TIMEOUT_SECONDS = 0.75
_MAX_INPUT_BYTES = 65_536
_MAX_STATE_FILES = 1_024
_MAX_STATE_AGE_SECONDS = 7 * 24 * 60 * 60


class ClientConfig(NamedTuple):
    port: int
    token: str
    tmux_socket_name: str | None


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request: Any, *args: Any, **kwargs: Any) -> None:
        del request, args, kwargs
        return None


def _build_http_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        _RejectRedirects(),
    )


def _environment_path() -> Path:
    return Path.home() / ".config" / "bitveins" / "env"


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_client_config(path: Path | None = None) -> ClientConfig:
    environment_path = path or _environment_path()
    directory_metadata = environment_path.parent.lstat()
    metadata = environment_path.lstat()
    current_uid = os.getuid() if hasattr(os, "getuid") else None
    if (
        stat.S_ISLNK(directory_metadata.st_mode)
        or not stat.S_ISDIR(directory_metadata.st_mode)
        or stat.S_IMODE(directory_metadata.st_mode) & 0o077
    ):
        raise PermissionError("Bitveins configuration directory must be private")
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise PermissionError("Bitveins environment must be a regular private file")
    if stat.S_IMODE(metadata.st_mode) & 0o077:
        raise PermissionError("Bitveins environment permissions must be 0600")
    if current_uid is not None and (
        directory_metadata.st_uid != current_uid or metadata.st_uid != current_uid
    ):
        raise PermissionError("Bitveins configuration must be owned by the current user")

    values: dict[str, str] = {}
    for raw_line in environment_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = _unquote(value.strip())

    token = values.get("BITVEINS_EVENT_TOKEN", "")
    port_text = values.get("PORT", "3000")
    socket_name = values.get("BITVEINS_TMUX_SOCKET_NAME", "").strip() or None
    if not token or len(token) > 4096:
        raise ValueError("Bitveins integration token is missing or invalid")
    port = int(port_text)
    if not 1 <= port <= 65535:
        raise ValueError("Bitveins port is invalid")
    if socket_name is not None and not _SOCKET_NAME_PATTERN.fullmatch(socket_name):
        raise ValueError("Bitveins tmux socket name is invalid")
    return ClientConfig(port, token, socket_name)


def _detect_tmux_context(
    environ: dict[str, str] | os._Environ[str] | None = None,
    run: Callable[..., Any] = subprocess.run,
    socket_name: str | None = None,
) -> dict[str, str]:
    environment = environ if environ is not None else os.environ
    pane = environment.get("TMUX_PANE", "")
    if not _PANE_PATTERN.fullmatch(pane):
        return {}
    current_socket_name = Path(environment.get("TMUX", "").split(",", 1)[0]).name
    expected_socket_name = socket_name or current_socket_name or "default"
    if socket_name and current_socket_name and current_socket_name != socket_name:
        return {}
    try:
        result = run(
            [
                "tmux", "-L", expected_socket_name, "display-message", "-p",
                "-t", pane, "#{window_id}\t#{pane_id}",
            ],
            capture_output=True,
            text=True,
            timeout=0.5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return {}
    fields = result.stdout.strip().split("\t") if result.returncode == 0 else []
    if len(fields) != 2:
        return {}
    window_id, pane_id = fields
    if not _WINDOW_PATTERN.fullmatch(window_id) or not _PANE_PATTERN.fullmatch(pane_id):
        return {}
    return {"windowId": window_id, "paneId": pane_id}


def _post_event(event_type: str, lifecycle: str) -> bool:
    if os.environ.get("BITVEINS_NOTIFICATIONS", "").strip().lower() in {
        "0", "false", "no", "off",
    }:
        return False
    try:
        config = _load_client_config()
        payload = {"type": event_type, "source": _SOURCE, "lifecycle": lifecycle}
        payload.update(_detect_tmux_context(socket_name=config.tmux_socket_name))
        request = urllib.request.Request(
            f"http://127.0.0.1:{config.port}/api/integrations/events",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {config.token}",
                "Content-Type": "application/json",
                "User-Agent": "Antigravity-Bitveins-Notifications/1.0",
            },
        )
        with _build_http_opener().open(
            request, timeout=_HTTP_TIMEOUT_SECONDS,
        ) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def _state_root(environ: dict[str, str] | os._Environ[str] | None = None) -> Path:
    environment = environ if environ is not None else os.environ
    root_text = environment.get("ANTIGRAVITY_STATE_DIR", "").strip()
    if root_text:
        root = Path(root_text) / "turns"
    else:
        root = Path.home() / ".config" / "bitveins" / "antigravity" / "turns"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    metadata = root.lstat()
    current_uid = os.getuid() if hasattr(os, "getuid") else None
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise PermissionError("Antigravity plugin state must be a regular directory")
    if current_uid is not None and metadata.st_uid != current_uid:
        raise PermissionError("Antigravity plugin state must be owned by the current user")
    root.chmod(0o700)
    return root


def _opaque_key(event: dict[str, Any]) -> str | None:
    conversation_id = event.get("conversationId") or event.get("conversation_id")
    if not isinstance(conversation_id, str) or not conversation_id:
        return None
    return hashlib.sha256(conversation_id.encode()).hexdigest()[:16]


def _mark_once(root: Path, key: str, suffix: str) -> bool:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(root / f"{key}.{suffix}", flags, 0o600)
    except FileExistsError:
        return False
    else:
        os.close(descriptor)
        return True


def _has_marker(root: Path, key: str, suffix: str) -> bool:
    try:
        metadata = (root / f"{key}.{suffix}").lstat()
        return stat.S_ISREG(metadata.st_mode) and not stat.S_ISLNK(metadata.st_mode)
    except OSError:
        return False


def _remove_marker(root: Path, key: str, suffix: str) -> None:
    try:
        (root / f"{key}.{suffix}").unlink(missing_ok=True)
    except OSError:
        pass


def _cleanup(root: Path, conversation_hash: str | None = None) -> None:
    try:
        files = [entry for entry in root.iterdir() if entry.is_file()]
        now = time.time()
        for entry in files:
            if conversation_hash and entry.name.startswith(f"{conversation_hash}."):
                entry.unlink(missing_ok=True)
            elif now - entry.stat().st_mtime > _MAX_STATE_AGE_SECONDS:
                entry.unlink(missing_ok=True)
        files = sorted(
            (entry for entry in root.iterdir() if entry.is_file()),
            key=lambda entry: entry.stat().st_mtime,
            reverse=True,
        )
        for entry in files[_MAX_STATE_FILES:]:
            entry.unlink(missing_ok=True)
    except OSError:
        pass


def _read_event(stream: Any = None) -> dict[str, Any]:
    input_stream = stream if stream is not None else sys.stdin.buffer
    raw = input_stream.read(_MAX_INPUT_BYTES + 1)
    if len(raw) > _MAX_INPUT_BYTES:
        raise ValueError("Antigravity hook input is too large")
    event = json.loads(raw)
    if not isinstance(event, dict):
        raise ValueError("Antigravity hook input must be an object")
    return event


def handle(event: dict[str, Any]) -> None:
    key = _opaque_key(event)
    if key is None:
        return

    root = _state_root()

    # PreInvocation: start of a new turn/prompt -> clear previous markers for this conversation
    if "invocationNum" in event and "terminationReason" not in event:
        _cleanup(root, key)
        return

    tool_call = event.get("toolCall")
    if not isinstance(tool_call, dict):
        tool_call = event.get("tool_call") if isinstance(event.get("tool_call"), dict) else None

    # Detect tool call / question events
    if tool_call is not None:
        _remove_marker(root, key, "completed")
        _remove_marker(root, key, "failed")
        _mark_once(root, key, "tool")
        tool_name = str(tool_call.get("name") or "")
        if tool_name == "ask_question":
            if _mark_once(root, key, "question"):
                _post_event("input_required", "input_required")
        return

    # Check for termination / stop
    termination_reason = event.get("terminationReason") or event.get("termination_reason")
    error = event.get("error")
    has_error = termination_reason == "error" or (isinstance(error, str) and bool(error.strip()))

    if has_error:
        if _mark_once(root, key, "failed"):
            _post_event("failed", "failed")
    elif termination_reason in {"model_stop", "max_steps_exceeded"} or "fullyIdle" in event:
        if _mark_once(root, key, "completed"):
            lifecycle = (
                "completed_with_tools" if _has_marker(root, key, "tool")
                else "completed_without_tools"
            )
            _post_event("completed", lifecycle)


def main() -> int:
    output = "{}"
    try:
        event = _read_event()
        handle(event)
        if "toolCall" in event or "tool_call" in event or event.get("hook_event_name") == "PreToolUse":
            output = json.dumps({"decision": "allow"})
    except Exception:
        pass
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
