from __future__ import annotations

import importlib.util
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

PLUGIN_PATH = Path(__file__).with_name("__init__.py")


def load_plugin():
    spec = importlib.util.spec_from_file_location("bitveins_notifications", PLUGIN_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load plugin")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeContext:
    def __init__(self):
        self.hooks = {}

    def register_hook(self, name, callback):
        self.hooks[name] = callback


class BitveinsNotificationsPluginTest(unittest.TestCase):
    def setUp(self):
        self.plugin = load_plugin()
        self.plugin._reset_state_for_tests()

    def test_private_environment_file_is_parsed_without_shell_expansion(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "env"
            path.write_text(
                "PORT=3000\nBITVEINS_EVENT_TOKEN='literal-$-token'\n",
                encoding="utf-8",
            )
            path.chmod(0o600)

            config = self.plugin._load_client_config(path)

            self.assertEqual(config.port, 3000)
            self.assertEqual(config.token, "literal-$-token")

    def test_private_environment_file_validates_optional_tmux_socket_name(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "env"
            path.write_text(
                "PORT=3000\n"
                "BITVEINS_EVENT_TOKEN=test-token\n"
                "BITVEINS_TMUX_SOCKET_NAME=bitveins.private-1\n",
                encoding="utf-8",
            )
            path.chmod(0o600)

            config = self.plugin._load_client_config(path)

            self.assertEqual(config.tmux_socket_name, "bitveins.private-1")

            path.write_text(
                "PORT=3000\n"
                "BITVEINS_EVENT_TOKEN=test-token\n"
                "BITVEINS_TMUX_SOCKET_NAME=--attacker socket\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                self.plugin._load_client_config(path)

    def test_environment_path_ignores_untrusted_overrides(self):
        with patch.dict(
            os.environ,
            {
                "BITVEINS_ENV_FILE": "/tmp/attacker/env",
                "XDG_CONFIG_HOME": "/tmp/attacker/config",
            },
        ):
            path = self.plugin._environment_path()

        self.assertEqual(path, Path.home() / ".config" / "bitveins" / "env")

    def test_environment_file_with_group_permissions_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "env"
            path.write_text("PORT=3000\nBITVEINS_EVENT_TOKEN=secret-token\n", encoding="utf-8")
            path.chmod(0o640)

            with self.assertRaises(PermissionError):
                self.plugin._load_client_config(path)

    def test_environment_directory_with_group_permissions_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            private_directory = Path(directory) / "config"
            private_directory.mkdir(mode=0o700)
            path = private_directory / "env"
            path.write_text("PORT=3000\nBITVEINS_EVENT_TOKEN=secret-token\n", encoding="utf-8")
            path.chmod(0o600)
            private_directory.chmod(0o750)

            with self.assertRaises(PermissionError):
                self.plugin._load_client_config(path)

    def test_tmux_context_collects_only_valid_window_and_pane_ids(self):
        completed = type("Completed", (), {
            "returncode": 0,
            "stdout": "@7\t%9\n",
        })()

        context = self.plugin._detect_tmux_context(
            {
                "TMUX": "/tmp/tmux-1000/default,123,0",
                "TMUX_PANE": "%9",
            },
            run=lambda *args, **kwargs: completed,
        )

        self.assertEqual(context, {"windowId": "@7", "paneId": "%9"})

    def test_tmux_context_rejects_a_different_server_socket(self):
        calls = []

        context = self.plugin._detect_tmux_context(
            {
                "TMUX": "/tmp/tmux-1000/hermes,123,0",
                "TMUX_PANE": "%9",
            },
            run=lambda *args, **kwargs: calls.append((args, kwargs)),
            socket_name="bitveins",
        )

        self.assertEqual(context, {})
        self.assertEqual(calls, [])

    def test_tmux_context_targets_the_configured_matching_socket(self):
        calls = []
        completed = type("Completed", (), {
            "returncode": 0,
            "stdout": "@7\t%9\n",
        })()

        def run(*args, **kwargs):
            calls.append((args, kwargs))
            return completed

        context = self.plugin._detect_tmux_context(
            {
                "TMUX": "/tmp/tmux-1000/bitveins,123,0",
                "TMUX_PANE": "%9",
            },
            run=run,
            socket_name="bitveins",
        )

        self.assertEqual(context, {"windowId": "@7", "paneId": "%9"})
        self.assertEqual(
            calls[0][0][0][:3],
            ["tmux", "-L", "bitveins"],
        )

    def test_tmux_context_never_collects_current_path_or_project_name(self):
        calls = []
        completed = type("Completed", (), {
            "returncode": 0,
            "stdout": "@7\t%9\n",
        })()

        def run(*args, **kwargs):
            calls.append((args, kwargs))
            return completed

        context = self.plugin._detect_tmux_context({
            "TMUX": "/tmp/tmux-1000/default,123,0",
            "TMUX_PANE": "%9",
        }, run=run)

        self.assertNotIn("project", context)
        self.assertNotIn("sessionName", context)
        self.assertNotIn("pane_current_path", calls[0][0][0][-1])

    def test_tmux_context_rejects_malformed_output(self):
        completed = type("Completed", (), {
            "returncode": 0,
            "stdout": "_bitveins_42\t\t@7\t%9\n",
        })()

        context = self.plugin._detect_tmux_context(
            {
                "TMUX": "/tmp/tmux-1000/default,123,0",
                "TMUX_PANE": "%9",
            },
            run=lambda *args, **kwargs: completed,
        )

        self.assertEqual(context, {})

    def test_wire_payload_contains_only_lifecycle_and_minimal_tmux_ids(self):
        with patch.object(self.plugin, "_detect_tmux_context", return_value={
            "sessionName": "sensitive-project-name",
            "windowId": "@7",
            "paneId": "%9",
        }):
            payload = self.plugin._build_payload("completed", "completed_with_tools")

        self.assertEqual(payload, {
            "type": "completed",
            "source": "hermes",
            "lifecycle": "completed_with_tools",
            "windowId": "@7",
            "paneId": "%9",
        })

    def test_http_redirect_is_rejected_without_forwarding_the_token(self):
        requests = []

        class RedirectHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append((self.path, self.headers.get("Authorization")))
                self.send_response(302)
                self.send_header("Location", "/redirected")
                self.end_headers()

            def do_GET(self):
                requests.append((self.path, self.headers.get("Authorization")))
                self.send_response(200)
                self.end_headers()

            def log_message(self, format, *args):
                del format, args

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "env"
                path.write_text(
                    f"PORT={server.server_port}\nBITVEINS_EVENT_TOKEN=test-token\n",
                    encoding="utf-8",
                )
                path.chmod(0o600)
                with (
                    patch.object(self.plugin, "_environment_path", return_value=path),
                    patch.object(self.plugin, "_detect_tmux_context", return_value={}),
                ):
                    sent = self.plugin._post_event("completed", "completed_with_tools")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertFalse(sent)
        self.assertEqual(requests, [
            ("/api/integrations/events", "Bearer test-token"),
        ])

    def test_http_opener_disables_environment_proxies(self):
        proxy_requests = []

        class ProxyHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                proxy_requests.append(self.path)
                self.send_response(200)
                self.end_headers()

            def log_message(self, format, *args):
                del format, args

        proxy = ThreadingHTTPServer(("127.0.0.1", 0), ProxyHandler)
        thread = threading.Thread(target=proxy.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "env"
                path.write_text(
                    "PORT=9\nBITVEINS_EVENT_TOKEN=test-token\n",
                    encoding="utf-8",
                )
                path.chmod(0o600)
                with (
                    patch.dict(
                        os.environ,
                        {
                            "HTTP_PROXY": f"http://127.0.0.1:{proxy.server_port}",
                            "NO_PROXY": "",
                        },
                    ),
                    patch.object(self.plugin, "_environment_path", return_value=path),
                    patch.object(self.plugin, "_detect_tmux_context", return_value={}),
                ):
                    sent = self.plugin._post_event("completed", "completed_with_tools")
        finally:
            proxy.shutdown()
            proxy.server_close()
            thread.join(timeout=2)

        self.assertFalse(sent)
        self.assertEqual(proxy_requests, [])

    def test_environment_opt_out_skips_configuration_and_delivery(self):
        with (
            patch.dict(os.environ, {"BITVEINS_NOTIFICATIONS": "0"}),
            patch.object(self.plugin, "_load_client_config") as load_config,
        ):
            sent = self.plugin._post_event("completed", "completed_with_tools")

        self.assertFalse(sent)
        load_config.assert_not_called()

    def test_unexpected_transport_failure_is_best_effort(self):
        with patch.object(
            self.plugin,
            "_load_client_config",
            side_effect=RuntimeError("unexpected transport failure"),
        ):
            sent = self.plugin._post_event("completed", "completed_with_tools")

        self.assertFalse(sent)

    def test_registered_hooks_cover_parent_turns_input_and_permissions(self):
        context = FakeContext()

        self.plugin.register(context)

        self.assertEqual(set(context.hooks), {
            "pre_llm_call",
            "post_llm_call",
            "pre_tool_call",
            "post_tool_call",
            "pre_approval_request",
            "on_session_end",
            "on_session_finalize",
            "on_session_reset",
            "subagent_start",
            "subagent_stop",
        })

    def test_clarify_tool_emits_input_required_without_prompt_content(self):
        secret_question = "Send secret API key «redacted:sk-…»"
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_pre_llm_call(session_id="s1", task_id="t1")
            self.plugin._on_pre_tool_call(
                session_id="s1",
                task_id="t1",
                tool_name="clarify",
                args={"question": secret_question},
            )

        post.assert_called_once_with("input_required", "input_required")
        self.assertNotIn(secret_question, str(post.call_args))
        self.assertNotIn("«redacted:sk-…»", str(post.call_args))

    def test_manual_approval_emits_permission_but_smart_approval_does_not(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_pre_approval_request(
                session_key="s1",
                surface="smart",
                command="dangerous --token secret",
                description="secret operation",
            )
            self.plugin._on_pre_approval_request(
                session_key="s1",
                surface="unknown",
                command="dangerous --token secret",
            )
            self.plugin._on_pre_approval_request(
                session_key="s1",
                surface="cli",
                command="dangerous --token secret",
                description="secret operation",
            )

        post.assert_called_once_with(
            "permission_required",
            "permission_required",
        )

    def test_gateway_approval_emits_permission(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_pre_approval_request(
                session_key="gateway:session",
                surface="gateway",
                command="sensitive command content",
            )

        post.assert_called_once_with(
            "permission_required",
            "permission_required",
        )

    def test_repeated_manual_approvals_each_emit_permission(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            for _ in range(2):
                self.plugin._on_pre_approval_request(
                    session_key="s1",
                    surface="cli",
                    pattern_key="terminal:dangerous",
                )

        self.assertEqual(post.call_count, 2)

    def test_successful_tool_turn_emits_completed(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_pre_llm_call(session_id="s1", task_id="t1", turn_id="turn-1")
            self.plugin._on_post_tool_call(
                session_id="s1",
                task_id="t1",
                turn_id="turn-1",
                tool_name="terminal",
            )
            self.plugin._on_post_llm_call(
                session_id="s1",
                task_id="t1",
                turn_id="turn-1",
                assistant_response="secret response content",
            )
            self.plugin._on_session_end(
                session_id="s1",
                task_id="t1",
                turn_id="turn-1",
                completed=True,
                failed=False,
                interrupted=False,
            )

        post.assert_called_once_with(
            "completed",
            "completed_with_tools",
        )

    def test_successful_chat_only_turn_emits_filterable_completed_signal(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_pre_llm_call(session_id="s1", task_id="t1", turn_id="turn-1")
            self.plugin._on_post_llm_call(
                session_id="s1",
                task_id="t1",
                turn_id="turn-1",
                assistant_response="private answer",
            )
            self.plugin._on_session_end(
                session_id="s1",
                task_id="t1",
                turn_id="turn-1",
                completed=True,
                failed=False,
                interrupted=False,
            )

        post.assert_called_once_with(
            "completed",
            "completed_without_tools",
        )
        self.assertNotIn("private answer", str(post.call_args))

    def test_repeated_post_llm_hook_emits_one_completed_event(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_pre_llm_call(
                session_id="s1",
                task_id="t1",
                turn_id="turn-1",
            )
            for _ in range(2):
                self.plugin._on_post_llm_call(
                    session_id="s1",
                    task_id="t1",
                    turn_id="turn-1",
                )

        post.assert_called_once_with(
            "completed",
            "completed_without_tools",
        )

    def test_failed_turn_emits_failed_but_interrupted_turn_is_silent(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_session_end(
                session_id="s1",
                task_id="t1",
                completed=False,
                failed=True,
                interrupted=False,
            )
            self.plugin._on_session_end(
                session_id="s1",
                task_id="t1",
                completed=False,
                failed=True,
                interrupted=False,
            )
            self.plugin._on_session_end(
                session_id="s2",
                task_id="t2",
                completed=False,
                failed=False,
                interrupted=True,
            )

        post.assert_called_once_with(
            "failed",
            "failed",
        )

    def test_subagent_completion_is_silent(self):
        with patch.object(self.plugin, "_enqueue_event") as post:
            self.plugin._on_subagent_start(child_session_id="child-1")
            self.plugin._on_pre_llm_call(session_id="child-1", task_id="child-task")
            self.plugin._on_post_tool_call(
                session_id="child-1",
                task_id="child-task",
                tool_name="terminal",
            )
            self.plugin._on_post_llm_call(
                session_id="child-1",
                task_id="child-task",
                assistant_response="child answer",
            )
            self.plugin._on_session_end(
                session_id="child-1",
                task_id="child-task",
                completed=True,
                failed=False,
                interrupted=False,
            )
            self.plugin._on_subagent_stop(child_session_id="child-1")

        post.assert_not_called()

    def test_tracking_is_bounded_and_forced_session_cleanup_is_complete(self):
        for index in range(self.plugin._MAX_TRACKED_TURNS + 5):
            self.plugin._on_pre_llm_call(
                session_id=f"session-{index}",
                task_id=f"task-{index}",
            )
        for index in range(self.plugin._MAX_TRACKED_CHILDREN + 5):
            self.plugin._on_subagent_start(child_session_id=f"child-{index}")

        self.assertLessEqual(len(self.plugin._turn_states), self.plugin._MAX_TRACKED_TURNS)
        self.assertLessEqual(len(self.plugin._child_sessions), self.plugin._MAX_TRACKED_CHILDREN)

        self.plugin._on_subagent_start(child_session_id="forced-child")
        self.plugin._on_pre_llm_call(session_id="forced-child", task_id="forced-task")
        self.plugin._on_session_finalize(session_id="forced-child")
        self.assertNotIn("forced-child", self.plugin._child_sessions)
        self.assertNotIn("forced-task", self.plugin._turn_states)

        self.plugin._on_pre_llm_call(session_id="reset-session", task_id="reset-task")
        self.plugin._on_post_llm_call(session_id="reset-session", task_id="reset-task")
        self.plugin._on_session_reset(session_id="reset-session")
        self.assertNotIn("reset-task", self.plugin._turn_states)
        self.assertNotIn("reset-task", self.plugin._finished_turns)

    def test_async_delivery_is_bounded_and_uses_one_worker(self):
        started = threading.Event()
        release = threading.Event()
        calls = []

        def sender(*event):
            started.set()
            release.wait(timeout=1)
            calls.append(event)

        delivery = self.plugin._DeliveryQueue(sender, capacity=1)
        self.assertTrue(delivery.enqueue("completed", "completed_with_tools"))
        self.assertTrue(started.wait(timeout=1))
        worker = delivery._worker
        self.assertTrue(delivery.enqueue("completed", "completed_with_tools"))
        self.assertFalse(delivery.enqueue("completed", "completed_with_tools"))
        self.assertIs(delivery._worker, worker)

        release.set()
        delivery._queue.join()
        self.assertEqual(len(calls), 2)

    def test_async_delivery_survives_transport_exceptions(self):
        calls = []

        def sender(*event):
            calls.append(event)
            if len(calls) == 1:
                raise RuntimeError("transport failure")

        delivery = self.plugin._DeliveryQueue(sender, capacity=2)
        self.assertTrue(delivery.enqueue("failed", "failed"))
        self.assertTrue(delivery.enqueue("failed", "failed"))
        delivery._queue.join()

        self.assertEqual(len(calls), 2)
        self.assertTrue(delivery._worker.is_alive())


if __name__ == "__main__":
    unittest.main()
