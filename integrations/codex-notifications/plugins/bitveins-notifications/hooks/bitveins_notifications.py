"""Privacy-safe Codex lifecycle notifications for local Bitveins."""

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

_SOURCE = "codex"
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
    expected_socket_name = socket_name or "default"
    if current_socket_name != expected_socket_name:
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
                "User-Agent": "Codex-Bitveins-Notifications/1.0",
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
    root_text = environment.get("PLUGIN_DATA", "").strip()
    if not root_text:
        raise ValueError("Codex plugin data directory is unavailable")
    root = Path(root_text) / "turns"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    metadata = root.lstat()
    current_uid = os.getuid() if hasattr(os, "getuid") else None
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise PermissionError("Codex plugin state must be a regular directory")
    if current_uid is not None and metadata.st_uid != current_uid:
        raise PermissionError("Codex plugin state must be owned by the current user")
    root.chmod(0o700)
    return root


def _opaque_key(event: dict[str, Any]) -> tuple[str, str] | None:
    session_id = event.get("session_id")
    turn_id = event.get("turn_id")
    if not isinstance(session_id, str) or not session_id:
        return None
    if not isinstance(turn_id, str) or not turn_id:
        return None
    session_hash = hashlib.sha256(session_id.encode()).hexdigest()[:16]
    turn_hash = hashlib.sha256(f"{session_id}\0{turn_id}".encode()).hexdigest()[:32]
    return session_hash, f"{session_hash}-{turn_hash}"


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


def _cleanup(root: Path, session_hash: str | None = None) -> None:
    try:
        files = [entry for entry in root.iterdir() if entry.is_file()]
        now = time.time()
        for entry in files:
            if session_hash and entry.name.startswith(f"{session_hash}-"):
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


def _read_event(stream: Any = sys.stdin.buffer) -> dict[str, Any]:
    raw = stream.read(_MAX_INPUT_BYTES + 1)
    if len(raw) > _MAX_INPUT_BYTES:
        raise ValueError("Codex hook input is too large")
    event = json.loads(raw)
    if not isinstance(event, dict):
        raise ValueError("Codex hook input must be an object")
    return event


def handle(event: dict[str, Any]) -> None:
    event_name = event.get("hook_event_name")
    key_parts = _opaque_key(event)
    if event_name == "SessionEnd":
        session_id = event.get("session_id")
        if isinstance(session_id, str) and session_id:
            session_hash = hashlib.sha256(session_id.encode()).hexdigest()[:16]
            _cleanup(_state_root(), session_hash)
        return
    if key_parts is None:
        return

    session_hash, key = key_parts
    root = _state_root()
    if event_name == "UserPromptSubmit":
        _cleanup(root)
    elif event_name == "PreToolUse":
        _mark_once(root, key, "tool")
    elif event_name == "PermissionRequest":
        _post_event("permission_required", "permission_required")
    elif (
        event_name == "Stop"
        and isinstance(event.get("last_assistant_message"), str)
        and event["last_assistant_message"].strip()
        and _mark_once(root, key, "completed")
    ):
        lifecycle = (
            "completed_with_tools" if _has_marker(root, key, "tool")
            else "completed_without_tools"
        )
        _post_event("completed", lifecycle)
    del session_hash


def main() -> int:
    event_name = ""
    try:
        event = _read_event()
        event_name = str(event.get("hook_event_name") or "")
        handle(event)
    except Exception:
        pass
    if event_name == "Stop":
        print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
