"""Release configuration contracts, using no personal data."""

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent


class BuildTests(unittest.TestCase):
    def test_versions_and_portable_target(self):
        package = json.loads((ROOT / "desktop/package.json").read_text())
        lock = json.loads((ROOT / "desktop/package-lock.json").read_text())
        config = json.loads((ROOT / "desktop/electron-builder.json").read_text())
        self.assertEqual(package["version"], lock["version"])
        self.assertEqual(package["version"], lock["packages"][""]["version"])
        self.assertEqual(package["version"], (ROOT / "VERSION").read_text().strip())
        self.assertEqual(config["win"]["target"], "portable")
        self.assertTrue(config["asar"])
        self.assertEqual(config["portable"]["requestExecutionLevel"], "user")

    def test_distribution_is_allowlisted(self):
        config = json.loads((ROOT / "desktop/electron-builder.json").read_text())
        self.assertNotIn("**/*", config["files"])
        self.assertNotIn("../backend", str(config["files"]))
        self.assertEqual(
            config["extraResources"][0]["from"], "../build/backend/jarvis-backend"
        )
        for pattern in config["files"]:
            self.assertNotIn(".env", pattern)
            self.assertNotIn(".sqlite", pattern)

    def test_batch_uses_own_directory_and_reports_errors(self):
        batch = (ROOT / "build.bat").read_text()
        self.assertIn('cd /d "%~dp0"', batch)
        self.assertIn("if errorlevel 1", batch)
        self.assertNotIn("pip install", batch)


if __name__ == "__main__":
    unittest.main()
