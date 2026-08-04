"""Privacy-safe Hermes lifecycle notifications for local Bitveins."""

from __future__ import annotations

import json
import os
import queue
import re
import stat
import subprocess
import threading
import urllib.request
from collections import OrderedDict
from pathlib import Path
from typing import Any, Callable, NamedTuple

_SOURCE = "hermes"
_WINDOW_PATTERN = re.compile(r"^@\d+$")
_PANE_PATTERN = re.compile(r"^%\d+$")
_HTTP_TIMEOUT_SECONDS = 0.75
_MAX_TRACKED_TURNS = 256
_MAX_TRACKED_CHILDREN = 128


class ClientConfig(NamedTuple):
    port: int
    token: str


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request: Any, *args: Any, **kwargs: Any) -> None:
        del request, args, kwargs
        return None


def _build_http_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        _RejectRedirects(),
    )


_state_lock = threading.RLock()
_turn_states: OrderedDict[str, dict[str, Any]] = OrderedDict()
_finished_turns: OrderedDict[str, str] = OrderedDict()
_child_sessions: OrderedDict[str, None] = OrderedDict()


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
    if not token or len(token) > 4096:
        raise ValueError("Bitveins integration token is missing or invalid")
    try:
        port = int(port_text)
    except ValueError as error:
        raise ValueError("Bitveins port is invalid") from error
    if not 1 <= port <= 65535:
        raise ValueError("Bitveins port is invalid")
    return ClientConfig(port=port, token=token)


def _detect_tmux_context(
    environ: dict[str, str] | os._Environ[str] | None = None,
    run: Callable[..., Any] = subprocess.run,
) -> dict[str, str]:
    environment = environ if environ is not None else os.environ
    pane = environment.get("TMUX_PANE", "")
    if not _PANE_PATTERN.fullmatch(pane):
        return {}
    try:
        result = run(
            [
                "tmux",
                "display-message",
                "-p",
                "-t",
                pane,
                "#{window_id}\t#{pane_id}",
            ],
            capture_output=True,
            text=True,
            timeout=0.5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return {}
    if result.returncode != 0:
        return {}

    fields = result.stdout.strip().split("\t")
    if len(fields) != 2:
        return {}
    window_id, pane_id = fields
    if not _WINDOW_PATTERN.fullmatch(window_id) or not _PANE_PATTERN.fullmatch(pane_id):
        return {}

    return {
        "windowId": window_id,
        "paneId": pane_id,
    }


def _build_payload(
    event_type: str,
    lifecycle: str,
) -> dict[str, str]:
    payload = {
        "type": event_type,
        "source": _SOURCE,
        "lifecycle": lifecycle,
    }
    context = _detect_tmux_context()
    for key in ("windowId", "paneId"):
        if key in context:
            payload[key] = context[key]
    return payload


def _post_event(
    event_type: str,
    lifecycle: str,
) -> bool:
    if os.environ.get("BITVEINS_NOTIFICATIONS", "").strip().lower() in {
        "0",
        "false",
        "no",
        "off",
    }:
        return False
    try:
        config = _load_client_config()
        body = json.dumps(
            _build_payload(event_type, lifecycle),
            separators=(",", ":"),
        ).encode("utf-8")
        request = urllib.request.Request(
            f"http://127.0.0.1:{config.port}/api/integrations/events",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {config.token}",
                "Content-Type": "application/json",
                "User-Agent": "Hermes-Bitveins-Notifications/1.0",
            },
        )
        opener = _build_http_opener()
        with opener.open(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


class _DeliveryQueue:
    def __init__(self, sender: Callable[..., bool], capacity: int = 64):
        self._sender = sender
        self._queue: queue.Queue[tuple[str, str]] = queue.Queue(
            maxsize=capacity,
        )
        self._worker_lock = threading.Lock()
        self._worker: threading.Thread | None = None

    def enqueue(
        self,
        event_type: str,
        lifecycle: str,
    ) -> bool:
        try:
            with self._worker_lock:
                if self._worker is None or not self._worker.is_alive():
                    self._worker = threading.Thread(
                        target=self._run,
                        name="bitveins-notifications",
                        daemon=True,
                    )
                    self._worker.start()
            self._queue.put_nowait((event_type, lifecycle))
            return True
        except (queue.Full, RuntimeError):
            return False

    def _run(self) -> None:
        while True:
            event = self._queue.get()
            try:
                self._sender(*event)
            except Exception:
                pass
            finally:
                self._queue.task_done()


_delivery = _DeliveryQueue(_post_event)


def _enqueue_event(
    event_type: str,
    lifecycle: str,
) -> bool:
    try:
        return _delivery.enqueue(event_type, lifecycle)
    except Exception:
        return False


def _turn_key(kwargs: dict[str, Any]) -> str:
    return str(
        kwargs.get("turn_id")
        or kwargs.get("task_id")
        or kwargs.get("session_id")
        or ""
    )


def _remember_bounded(
    mapping: OrderedDict[str, Any],
    key: str,
    value: Any,
    capacity: int,
) -> None:
    mapping.pop(key, None)
    mapping[key] = value
    while len(mapping) > capacity:
        mapping.popitem(last=False)


def _new_turn_state(session_id: str) -> dict[str, Any]:
    return {
        "completed_notified": False,
        "had_tool": False,
        "input_notified": False,
        "session_id": session_id,
    }


def _state_for(key: str, session_id: str) -> dict[str, Any]:
    state = _turn_states.get(key)
    if state is None:
        state = _new_turn_state(session_id)
    elif session_id and not state["session_id"]:
        state["session_id"] = session_id
    _remember_bounded(_turn_states, key, state, _MAX_TRACKED_TURNS)
    return state


def _on_pre_llm_call(**kwargs: Any) -> None:
    key = _turn_key(kwargs)
    if not key:
        return
    with _state_lock:
        _finished_turns.pop(key, None)
        _remember_bounded(
            _turn_states,
            key,
            _new_turn_state(str(kwargs.get("session_id") or "")),
            _MAX_TRACKED_TURNS,
        )


def _on_pre_tool_call(tool_name: str = "", **kwargs: Any) -> None:
    key = _turn_key(kwargs)
    if tool_name != "clarify":
        return
    should_notify = True
    if key:
        with _state_lock:
            state = _state_for(key, str(kwargs.get("session_id") or ""))
            should_notify = not state["input_notified"]
            state["input_notified"] = True
    if should_notify:
        _enqueue_event("input_required", "input_required")


def _on_post_tool_call(**kwargs: Any) -> None:
    key = _turn_key(kwargs)
    if not key:
        return
    with _state_lock:
        state = _state_for(key, str(kwargs.get("session_id") or ""))
        state["had_tool"] = True


def _on_post_llm_call(session_id: str = "", **kwargs: Any) -> None:
    key = _turn_key({"session_id": session_id, **kwargs})
    if not key:
        return
    with _state_lock:
        if key in _finished_turns:
            return
        state = _state_for(key, session_id)
        is_child = session_id in _child_sessions
        had_tool = state["had_tool"]
        should_notify = not state["completed_notified"]
        state["completed_notified"] = True
        _remember_bounded(_finished_turns, key, session_id, _MAX_TRACKED_TURNS)
    if is_child or not should_notify:
        return
    if had_tool:
        _enqueue_event("completed", "completed_with_tools")
    else:
        _enqueue_event("completed", "completed_without_tools")


def _on_pre_approval_request(
    session_key: str = "",
    surface: str = "",
    pattern_key: str = "",
    **kwargs: Any,
) -> None:
    del kwargs, session_key, pattern_key
    if surface not in {"manual", "cli", "gateway"}:
        return
    _enqueue_event("permission_required", "permission_required")


def _on_session_end(
    session_id: str = "",
    completed: bool = False,
    failed: bool = False,
    interrupted: bool = False,
    **kwargs: Any,
) -> None:
    key = _turn_key({"session_id": session_id, **kwargs})
    if not key:
        return
    with _state_lock:
        _turn_states.pop(key, None)
        already_finished = key in _finished_turns
        _remember_bounded(_finished_turns, key, session_id, _MAX_TRACKED_TURNS)
        is_child = session_id in _child_sessions
        _child_sessions.pop(session_id, None)
    if already_finished or is_child or interrupted:
        return
    if failed or not completed:
        _enqueue_event("failed", "failed")


def _on_subagent_start(child_session_id: str | None = None, **kwargs: Any) -> None:
    del kwargs
    if child_session_id:
        with _state_lock:
            _remember_bounded(
                _child_sessions,
                child_session_id,
                None,
                _MAX_TRACKED_CHILDREN,
            )


def _on_subagent_stop(child_session_id: str | None = None, **kwargs: Any) -> None:
    del kwargs
    if child_session_id:
        with _state_lock:
            _child_sessions.pop(child_session_id, None)


def _cleanup_session(session_id: str) -> None:
    if not session_id:
        return
    with _state_lock:
        for key, state in list(_turn_states.items()):
            if state["session_id"] == session_id:
                _turn_states.pop(key, None)
        for key, tracked_session_id in list(_finished_turns.items()):
            if tracked_session_id == session_id:
                _finished_turns.pop(key, None)
        _child_sessions.pop(session_id, None)


def _on_session_finalize(session_id: str = "", **kwargs: Any) -> None:
    del kwargs
    _cleanup_session(session_id)


def _on_session_reset(session_id: str = "", **kwargs: Any) -> None:
    del kwargs
    _cleanup_session(session_id)


def _reset_state_for_tests() -> None:
    with _state_lock:
        _turn_states.clear()
        _finished_turns.clear()
        _child_sessions.clear()


def register(ctx: Any) -> None:
    ctx.register_hook("pre_llm_call", _on_pre_llm_call)
    ctx.register_hook("post_llm_call", _on_post_llm_call)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("pre_approval_request", _on_pre_approval_request)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("on_session_finalize", _on_session_finalize)
    ctx.register_hook("on_session_reset", _on_session_reset)
    ctx.register_hook("subagent_start", _on_subagent_start)
    ctx.register_hook("subagent_stop", _on_subagent_stop)
