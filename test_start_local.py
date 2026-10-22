import contextlib
import os
import unittest
from unittest.mock import Mock, patch

import start
from tools import start_local


class LocalLauncherTests(unittest.TestCase):
    def flow(self, busy=False, cloud_exit=None, desktop_exit=0):
        owner = Mock()
        cloud = Mock()
        cloud.poll.return_value = cloud_exit
        desktop = Mock()
        desktop.poll.return_value = desktop_exit
        desktop.returncode = desktop_exit
        owner.spawn.side_effect = [cloud, desktop]
        stack = contextlib.ExitStack()
        stack.enter_context(patch.object(start, "InstanceLock", return_value=contextlib.nullcontext()))
        stack.enter_context(patch.object(start, "OwnedProcesses", return_value=owner))
        stack.enter_context(patch.object(start_local.shutil, "which", return_value="node"))
        stack.enter_context(patch.object(start_local.Path, "is_file", return_value=True))
        stack.enter_context(patch.object(start_local, "cloud_port_busy", return_value=busy))
        wait = stack.enter_context(patch.object(start_local, "wait_cloud"))
        stack.enter_context(patch.object(start, "say"))
        return stack, owner, cloud, wait

    def test_cloud_ready_before_desktop_and_close_after_desktop_exit(self):
        stack, owner, cloud, wait = self.flow()
        with stack:
            self.assertEqual(start_local.launch(), 0)
        wait.assert_called_once_with(cloud)
        cloud_args, desktop_args = owner.spawn.call_args_list
        self.assertEqual(cloud_args.args[1], start.ROOT / "cloud")
        self.assertEqual(cloud_args.kwargs["env"]["APP_ORIGIN"], start_local.ORIGIN)
        self.assertEqual(desktop_args.args[0][-1], start.ROOT / "tools/start_cloud.py")
        self.assertEqual(desktop_args.kwargs["env"]["JARVIS_CLOUD_ORIGIN"], start_local.ORIGIN)
        owner.close.assert_called_once()

    def test_busy_cloud_port_never_touches_existing_services(self):
        stack, owner, _, wait = self.flow(busy=True)
        with stack, self.assertRaisesRegex(start.LaunchError, "3000"):
            start_local.launch()
        owner.spawn.assert_not_called()
        owner.close.assert_not_called()
        wait.assert_not_called()

    def test_failed_cloud_start_cleans_only_own_processes(self):
        stack, owner, _, wait = self.flow()
        wait.side_effect = start.LaunchError("Cloud indisponível")
        with stack, self.assertRaises(start.LaunchError):
            start_local.launch()
        self.assertEqual(owner.spawn.call_count, 1)
        owner.close.assert_called_once()

    def test_cloud_crash_stops_owned_desktop(self):
        stack, owner, _, _ = self.flow(cloud_exit=1, desktop_exit=None)
        with stack, self.assertRaisesRegex(start.LaunchError, "Cloud local encerrou"):
            start_local.launch()
        owner.close.assert_called_once()

    def test_desktop_never_inherits_cloud_secrets(self):
        private = {key: "synthetic-secret" for key in ["OPENAI_API_KEY", "DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "BOOTSTRAP_PASSWORD"]}
        with patch.dict(os.environ, private):
            env = start_local.desktop_environment()
            self.assertTrue(all(key not in env for key in private))
            self.assertTrue(all(key in os.environ for key in private))
        self.assertEqual(env["JARVIS_CLOUD_ORIGIN"], start_local.ORIGIN)

    def test_wait_detects_child_failure_without_waiting_for_timeout(self):
        child = Mock()
        child.poll.return_value = 1
        with self.assertRaisesRegex(start.LaunchError, "Cloud encerrou"):
            start_local.wait_cloud(child)


if __name__ == "__main__":
    unittest.main()
