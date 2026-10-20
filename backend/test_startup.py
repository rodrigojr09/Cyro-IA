import contextlib
import json
from pathlib import Path
import tempfile
import unittest

from authorized_startup import enable, disable, match, digest, RUN_NAME


class Registry:
    HKEY_CURRENT_USER = 1
    REG_SZ = 1

    def __init__(self):
        self.values = {}

    def CreateKey(self, root, name):
        return contextlib.nullcontext(self)

    def QueryValueEx(self, key, name):
        if name not in self.values:
            raise FileNotFoundError
        return self.values[name], 1

    def SetValueEx(self, key, name, reserved, kind, value):
        self.values[name] = value

    def DeleteValue(self, key, name):
        del self.values[name]


class StartupTests(unittest.TestCase):
    def test_explicit_consent_registration_and_removal_without_touching_windows(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            app = root / "usb/JARVIS"
            (app / "app").mkdir(parents=True)
            (app / "app/JARVIS.exe").write_bytes(b"fixture-runtime")
            helper = root / "helper.exe"
            helper.write_bytes(b"fixture-helper")
            local = root / "local-consent"
            registry = Registry()
            with self.assertRaises(ValueError):
                enable(app, helper, registry=registry, folder=local)
            enable(
                app, helper, True, registry, local, identify=lambda _: "fixture-volume"
            )
            self.assertIn(RUN_NAME, registry.values)
            self.assertEqual(
                json.loads((local / "settings.json").read_text())["volume"],
                "fixture-volume",
            )
            with self.assertRaises(ValueError):
                disable(registry=registry, folder=local)
            disable(True, registry, local)
            self.assertNotIn(RUN_NAME, registry.values)
            self.assertFalse((local / "settings.json").exists())

    def test_changed_mount_path_and_modified_program_are_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            moved = root / "Z-drive"
            target = moved / "JARVIS/app/JARVIS.exe"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"fixture")
            config = {
                "format": 1,
                "volume": "fixed-volume-id",
                "relative": "JARVIS/app/JARVIS.exe",
                "sha256": digest(target),
            }
            self.assertEqual(
                match(config, [moved], identify=lambda _: "fixed-volume-id"), target
            )
            self.assertIsNone(match(config, [moved], identify=lambda _: "other-volume"))
            target.write_bytes(b"different")
            self.assertIsNone(
                match(config, [moved], identify=lambda _: "fixed-volume-id")
            )
            config["relative"] = "../JARVIS.exe"
            self.assertIsNone(
                match(config, [moved], identify=lambda _: "fixed-volume-id")
            )


if __name__ == "__main__":
    unittest.main()
