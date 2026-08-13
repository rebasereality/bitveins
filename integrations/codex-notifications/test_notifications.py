"""Tests for the bundled Bitveins Codex hooks."""

from __future__ import annotations

import importlib.util
import io
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch


def _load_plugin() -> ModuleType:
    path = (
        Path(__file__).parent
        / "plugins"
        / "bitveins-notifications"
        / "hooks"
        / "bitveins_notifications.py"
    )
    spec = importlib.util.spec_from_file_location("bitveins_codex_notifications", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load Codex notification plugin")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


plugin = _load_plugin()


class _Response:
    status = 204

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class CodexNotificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.plugin_data = self.root / "plugin-data"
        self.environment = {"PLUGIN_DATA": str(self.plugin_data)}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def event(self, name: str, turn: str = "turn-1") -> dict[str, str]:
        event = {
            "cwd": "/private/workspace",
            "hook_event_name": name,
            "model": "private-model",
            "session_id": "session-1",
            "transcript_path": "/private/transcript.jsonl",
            "turn_id": turn,
        }
        if name == "Stop":
            event["last_assistant_message"] = "Done."
        return event

    def test_tracks_tool_use_and_emits_one_completed_signal(self) -> None:
        sent: list[tuple[str, str]] = []
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", side_effect=lambda *item: sent.append(item) or True
        ):
            plugin.handle(self.event("UserPromptSubmit"))
            plugin.handle({**self.event("PreToolUse"), "tool_name": "Bash"})
            plugin.handle(self.event("Stop"))
            plugin.handle(self.event("Stop"))

        self.assertEqual(sent, [("completed", "completed_with_tools")])
        markers = list((self.plugin_data / "turns").iterdir())
        self.assertEqual({path.suffix for path in markers}, {".completed", ".tool"})
        self.assertTrue(all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in markers))

    def test_emits_text_only_completion_without_observable_tools(self) -> None:
        sender = Mock(return_value=True)
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", sender
        ):
            plugin.handle(self.event("Stop"))

        sender.assert_called_once_with("completed", "completed_without_tools")

    def test_emits_every_permission_request(self) -> None:
        sender = Mock(return_value=True)
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", sender
        ):
            plugin.handle(self.event("PermissionRequest"))
            plugin.handle(self.event("PermissionRequest"))
            plugin.handle(self.event("PermissionRequest", "turn-2"))

        self.assertEqual(sender.call_count, 3)
        sender.assert_called_with("permission_required", "permission_required")

    def test_suppresses_stop_without_an_assistant_message(self) -> None:
        sender = Mock(return_value=True)
        event = self.event("Stop")
        event["last_assistant_message"] = ""
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", sender
        ):
            plugin.handle(event)

        sender.assert_not_called()

    def test_session_end_removes_only_matching_opaque_state(self) -> None:
        with patch.dict(os.environ, self.environment, clear=False):
            plugin.handle({**self.event("PreToolUse"), "tool_name": "Bash"})
            plugin.handle({
                **self.event("PreToolUse", "other-turn"),
                "session_id": "other-session",
                "tool_name": "Bash",
            })
            plugin.handle({
                "hook_event_name": "SessionEnd",
                "session_id": "session-1",
            })

        markers = list((self.plugin_data / "turns").iterdir())
        self.assertEqual(len(markers), 1)
        expected_prefix = plugin.hashlib.sha256(b"other-session").hexdigest()[:16]
        self.assertTrue(markers[0].name.startswith(expected_prefix))

    def test_posts_only_typed_lifecycle_and_tmux_identifiers(self) -> None:
        opener = Mock()
        opener.open.return_value = _Response()
        config = plugin.ClientConfig(3210, "secret-token", "bitveins")
        with patch.object(plugin, "_load_client_config", return_value=config), patch.object(
            plugin,
            "_detect_tmux_context",
            return_value={"windowId": "@12", "paneId": "%13"},
        ), patch.object(plugin, "_build_http_opener", return_value=opener):
            self.assertTrue(plugin._post_event("completed", "completed_with_tools"))

        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:3210/api/integrations/events")
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 0.75)
        self.assertEqual(
            json.loads(request.data),
            {
                "lifecycle": "completed_with_tools",
                "paneId": "%13",
                "source": "codex",
                "type": "completed",
                "windowId": "@12",
            },
        )
        serialized = request.data.decode()
        for forbidden in ["private-model", "private/workspace", "transcript", "secret-token"]:
            self.assertNotIn(forbidden, serialized)

    def test_syncs_the_codex_session_id_to_its_tmux_pane(self) -> None:
        run = Mock(return_value=SimpleNamespace(returncode=0, stdout=""))
        config = plugin.ClientConfig(3210, "secret-token", "bitveins")
        with patch.object(plugin, "_load_client_config", return_value=config), patch.object(
            plugin,
            "_detect_tmux_context",
            return_value={"windowId": "@12", "paneId": "%13"},
        ), patch.object(plugin.subprocess, "run", run):
            self.assertTrue(plugin._sync_tmux_thread_id(self.event("SessionStart")))

        self.assertEqual(
            run.call_args.args[0],
            [
                "tmux", "-L", "bitveins", "set-option", "-p", "-t", "%13",
                "@bitveins_codex_thread_id", "session-1",
            ],
        )
        serialized = " ".join(run.call_args.args[0])
        for forbidden in ["private-model", "private/workspace", "transcript", "secret-token"]:
            self.assertNotIn(forbidden, serialized)

    def test_session_start_refreshes_tmux_metadata_without_turn_state(self) -> None:
        sync = Mock(return_value=True)
        with patch.object(plugin, "_sync_tmux_thread_id", sync):
            plugin.handle({
                "hook_event_name": "SessionStart",
                "session_id": "session-1",
            })

        sync.assert_called_once()

    def test_loads_only_the_private_canonical_environment_file(self) -> None:
        config_directory = self.root / ".config" / "bitveins"
        config_directory.mkdir(parents=True, mode=0o700)
        environment_file = config_directory / "env"
        environment_file.write_text(
            "PORT='3456'\nBITVEINS_EVENT_TOKEN=token\n"
            "BITVEINS_TMUX_SOCKET_NAME=bitveins\n",
            encoding="utf-8",
        )
        environment_file.chmod(0o600)

        self.assertEqual(
            plugin._load_client_config(environment_file),
            plugin.ClientConfig(3456, "token", "bitveins"),
        )
        environment_file.chmod(0o640)
        with self.assertRaises(PermissionError):
            plugin._load_client_config(environment_file)

    def test_tmux_context_requires_the_expected_socket_and_identifiers(self) -> None:
        run = Mock(return_value=SimpleNamespace(returncode=0, stdout="@7\t%8\n"))
        context = plugin._detect_tmux_context(
            {"TMUX": "/tmp/tmux/bitveins,1,0", "TMUX_PANE": "%8"},
            run=run,
            socket_name="bitveins",
        )
        self.assertEqual(context, {"windowId": "@7", "paneId": "%8"})
        self.assertEqual(run.call_args.args[0][0:3], ["tmux", "-L", "bitveins"])
        self.assertEqual(
            plugin._detect_tmux_context(
                {"TMUX": "/tmp/tmux/other,1,0", "TMUX_PANE": "%8"},
                run=run,
                socket_name="bitveins",
            ),
            {},
        )

    def test_rejects_oversized_or_non_object_hook_input(self) -> None:
        with self.assertRaises(ValueError):
            plugin._read_event(io.BytesIO(b"x" * (plugin._MAX_INPUT_BYTES + 1)))
        with self.assertRaises(ValueError):
            plugin._read_event(io.BytesIO(b"[]"))

    def test_main_never_steers_codex_and_returns_json_for_stop(self) -> None:
        stdout = io.StringIO()
        with patch.object(plugin, "_read_event", return_value=self.event("Stop")), patch.object(
            plugin, "handle", side_effect=RuntimeError("delivery failed")
        ), patch("sys.stdout", stdout):
            self.assertEqual(plugin.main(), 0)
        self.assertEqual(stdout.getvalue(), "{}\n")


if __name__ == "__main__":
    unittest.main()
