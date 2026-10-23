"""Installed distribution contracts; never runs installer against real data."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from tools import build_cloud_desktop

ROOT = Path(__file__).resolve().parent


class CloudBuildTests(unittest.TestCase):
    def test_installed_target_without_activation_protocol(self):
        config = json.loads((ROOT / "desktop/electron/builder.json").read_text())
        self.assertEqual(config["win"]["target"][0]["target"], "nsis")
        self.assertNotIn("protocols", config)
        self.assertFalse(config["nsis"]["deleteAppDataOnUninstall"])
        self.assertNotIn("**/*", config["files"])
        self.assertEqual(
            config["extraResources"][0]["from"], "../build/v5/backend/jarvis-backend"
        )
        self.assertNotIn("Backup", json.dumps(config))
        self.assertNotIn(".env", json.dumps(config))

    def test_versions_synchronized(self):
        paths = [
            "package.json",
            "cloud/package.json",
            "desktop/package.json",
            "packages/shared/package.json",
        ]
        versions = {json.loads((ROOT / name).read_text())["version"] for name in paths}
        self.assertEqual(versions, {(ROOT / "VERSION").read_text().strip()})
        for name in ["package-lock.json", "desktop/package-lock.json"]:
            lock = json.loads((ROOT / name).read_text())
            self.assertIn(lock["version"], versions)
            self.assertIn(lock["packages"][""]["version"], versions)

    def test_build_refuses_insecure_origin_before_spawning(self):
        with patch.dict(
            "os.environ", {"JARVIS_CLOUD_ORIGIN": "http://localhost:3000"}
        ), patch.object(build_cloud_desktop, "run") as run:
            with self.assertRaises(SystemExit):
                build_cloud_desktop.main()
            run.assert_not_called()

    def test_credential_file_excluded_from_git(self):
        ignored = (ROOT / ".gitignore").read_text()
        self.assertIn("cloud-session-v4.bin*", ignored)
        self.assertIn("/Backup/legacy/", ignored)


if __name__ == "__main__":
    unittest.main()
