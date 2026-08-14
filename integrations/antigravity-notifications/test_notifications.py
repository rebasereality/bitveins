"""Tests for the bundled Bitveins Antigravity hooks."""

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
    path = Path(__file__).parent / "bitveins_antigravity_notifications.py"
    spec = importlib.util.spec_from_file_location("bitveins_antigravity_notifications", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load Antigravity notification plugin")
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


class AntigravityNotificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.state_dir = self.root / "state"
        self.environment = {"ANTIGRAVITY_STATE_DIR": str(self.state_dir)}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def event(self, **kwargs) -> dict:
        data = {
            "conversationId": "conv-12345",
            "executionNum": 1,
        }
        data.update(kwargs)
        return data

    def test_tracks_tool_use_and_emits_completed_with_tools(self) -> None:
        sent: list[tuple[str, str]] = []
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", side_effect=lambda *item: sent.append(item) or True
        ):
            plugin.handle(self.event(invocationNum=1))
            plugin.handle(self.event(toolCall={"name": "run_command", "args": {}}))
            plugin.handle(self.event(terminationReason="model_stop"))
            plugin.handle(self.event(terminationReason="model_stop"))

        self.assertEqual(sent, [("completed", "completed_with_tools")])
        markers = list((self.state_dir / "turns").iterdir())
        self.assertEqual({path.suffix for path in markers}, {".completed", ".tool"})
        self.assertTrue(all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in markers))

    def test_emits_completed_without_tools(self) -> None:
        sender = Mock(return_value=True)
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", sender
        ):
            plugin.handle(self.event(terminationReason="model_stop"))

        sender.assert_called_once_with("completed", "completed_without_tools")

    def test_emits_failed_when_error_present(self) -> None:
        sender = Mock(return_value=True)
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", sender
        ):
            plugin.handle(self.event(terminationReason="error", error="Out of memory"))

        sender.assert_called_once_with("failed", "failed")

    def test_emits_input_required_for_ask_question(self) -> None:
        sent: list[tuple[str, str]] = []
        with patch.dict(os.environ, self.environment, clear=False), patch.object(
            plugin, "_post_event", side_effect=lambda *item: sent.append(item) or True
        ):
            plugin.handle(self.event(toolCall={"name": "ask_question", "args": {}}))
            plugin.handle(self.event(toolCall={"name": "ask_question", "args": {}}))

        self.assertEqual(sent, [("input_required", "input_required")])

    def test_reads_valid_json_stream(self) -> None:
        raw = json.dumps({"conversationId": "c1", "terminationReason": "model_stop"}).encode("utf-8")
        parsed = plugin._read_event(io.BytesIO(raw))
        self.assertEqual(parsed["conversationId"], "c1")
        self.assertEqual(parsed["terminationReason"], "model_stop")

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

    def test_posts_authorized_payload_to_local_server(self) -> None:
        opened: list[urllib.request.Request] = []

        class Opener:
            def open(self, request, timeout=0.75):
                opened.append(request)
                return _Response()

        config = plugin.ClientConfig(4321, "secret-token", "bitveins")
        with patch.object(plugin, "_load_client_config", return_value=config), patch.object(
            plugin,
            "_detect_tmux_context",
            return_value={"windowId": "@12", "paneId": "%13"},
        ), patch.object(plugin, "_build_http_opener", return_value=Opener()):
            self.assertTrue(plugin._post_event("completed", "completed_with_tools"))

        self.assertEqual(len(opened), 1)
        request = opened[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:4321/api/integrations/events")
        self.assertEqual(request.headers["Authorization"], "Bearer secret-token")
        self.assertEqual(request.headers["User-agent"], "Antigravity-Bitveins-Notifications/1.0")
        self.assertEqual(
            json.loads(request.data.decode()),
            {
                "lifecycle": "completed_with_tools",
                "paneId": "%13",
                "source": "antigravity",
                "type": "completed",
                "windowId": "@12",
            },
        )


if __name__ == "__main__":
    unittest.main()
