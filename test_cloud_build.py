"""Installed distribution contracts; never runs installer against real data."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from tools import build_cloud_desktop

ROOT = Path(__file__).resolve().parent


class CloudBuildTests(unittest.TestCase):
    def test_electron_runtime_is_pinned_and_matches_the_lock(self):
        package = json.loads((ROOT / "desktop/package.json").read_text())
        runtime = package["devDependencies"]["electron"]
        self.assertRegex(runtime, r"^\d+\.\d+\.\d+$")
        lock = json.loads((ROOT / "package-lock.json").read_text())
        installed = [
            value["version"]
            for key, value in lock["packages"].items()
            if key.endswith("node_modules/electron")
        ]
        self.assertEqual(installed, [runtime])

    def test_validation_children_reuse_build_python_without_changing_parent_path(self):
        with patch.dict("os.environ", {"PATH": "original-path"}), patch.object(
            build_cloud_desktop.subprocess, "run"
        ) as child:
            build_cloud_desktop.run(["fixture"])
            self.assertEqual(build_cloud_desktop.os.environ["PATH"], "original-path")
            self.assertEqual(
                child.call_args.kwargs["env"]["PATH"].split(
                    build_cloud_desktop.os.pathsep
                )[0],
                str(Path(build_cloud_desktop.sys.executable).parent),
            )

    def test_final_build_requires_complete_v6_validation(self):
        script = (ROOT / "tools/build_cloud_desktop.py").read_text()
        self.assertIn('run([npm, "run", "check:v6"])', script)
        validation = json.loads((ROOT / "package.json").read_text())["scripts"][
            "check:v6"
        ]
        self.assertIn("unittest discover -s backend", validation)
        self.assertIn("test:electron", validation)
        self.assertIn("check:repository", validation)

    def test_installed_target_without_activation_protocol(self):
        config = json.loads((ROOT / "desktop/electron/builder.json").read_text())
        self.assertEqual(config["win"]["target"][0]["target"], "nsis")
        self.assertNotIn("protocols", config)
        self.assertFalse(config["nsis"]["deleteAppDataOnUninstall"])
        self.assertNotIn("**/*", config["files"])
        self.assertEqual(
            config["extraResources"][0]["from"], "../build/v6/backend/jarvis-backend"
        )
        self.assertNotIn("Backup", json.dumps(config))
        self.assertNotIn(".env", json.dumps(config))

    def test_versions_synchronized(self):
        version = (ROOT / "VERSION").read_text().strip()
        for name, marker in [
            ("backend/main.py", f'version="{version}" if CLOUD'),
            (
                "desktop/index.html",
                f"<title>JARVIS {version} — Cloud + Desktop</title>",
            ),
            ("desktop/ui.js", f"JARVIS · v{version}"),
        ]:
            self.assertIn(marker, (ROOT / name).read_text(encoding="utf-8"))
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
