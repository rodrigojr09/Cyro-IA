import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from portable_paths import portable_root, resolve_source
from portable_backup import create_backup, restore_backup
from secure_vault import save_key, load_key
from project_store import ProjectStore, database
from portable_install import install, recover_install


class PortableTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "JARVIS" / "data"
        self.store = ProjectStore(self.data)

    def test_outer_executable_paths(self):
        self.assertEqual(
            portable_root(self.root / "JARVIS" / "app" / "JARVIS.exe"),
            self.root / "JARVIS",
        )
        self.assertEqual(portable_root(self.root / "JARVIS.exe"), self.root / "JARVIS")
        with self.assertRaises(ValueError):
            resolve_source("volume:../private", self.data)

    @unittest.skipUnless(os.name == "nt", "Referências de volume Windows")
    def test_portable_project_reference_and_memory_survive_reopen(self):
        source = self.root / "source"
        source.mkdir()
        (source / "main.py").write_text("print('fixture')")
        with patch.dict(os.environ, {"JARVIS_PORTABLE": "1"}):
            project = self.store.register(source)
        with database(self.store.registry) as con:
            self.assertTrue(
                con.execute("SELECT path FROM projects WHERE id=?", (project["id"],))
                .fetchone()[0]
                .startswith("volume:")
            )
            self.assertEqual(con.execute("PRAGMA user_version").fetchone()[0], 4)
        reopened = ProjectStore(self.data)
        self.assertEqual(reopened.project(project["id"])["category"], "GENERAL")
        self.assertEqual(Path(reopened.project(project["id"])["path"]), source)
        self.assertTrue(reopened.db_path(project["id"]).is_file())

    def test_backup_restore_chats_and_settings_and_keep_original(self):
        chat = self.store.create_chat(None, "Escritório")
        config = self.data / "config"
        config.mkdir()
        (config / "settings.json").write_text('{"theme":"light"}')
        backup = create_backup(self.data, self.root / "backups")
        self.store.create_chat(None, "Depois do backup")
        preserved = restore_backup(backup, self.data, confirmed=True)
        self.assertTrue(preserved.is_dir())
        restored = ProjectStore(self.data)
        with database(restored.registry) as con:
            titles = [row[0] for row in con.execute("SELECT title FROM chats")]
        self.assertIn(chat["title"], titles)
        self.assertNotIn("Depois do backup", titles)
        self.assertEqual(
            json.loads((config / "settings.json").read_text())["theme"], "light"
        )

    def test_restore_requires_confirmation_and_offline(self):
        backup = create_backup(self.data, self.root / "backups")
        with self.assertRaises(ValueError):
            restore_backup(backup, self.data)
        (self.data / ".local-token").write_text("fixture")
        with self.assertRaisesRegex(ValueError, "bandeja"):
            create_backup(self.data, self.root / "backups")
        with self.assertRaisesRegex(ValueError, "bandeja"):
            restore_backup(backup, self.data, confirmed=True)

    def test_corrupt_backup_preserves_live_data(self):
        bad = self.root / "bad.zip"
        with ZipFile(bad, "w") as archive:
            archive.writestr(
                "manifest.json",
                json.dumps({"format": 1, "databases": 2, "files": {"../escape": "0"}}),
            )
            archive.writestr("data/../escape", "invalid")
        with self.assertRaises(ValueError):
            restore_backup(bad, self.data, confirmed=True)
        self.assertTrue(self.store.registry.is_file())
        self.assertFalse((self.root / "escape").exists())

    def test_backup_retention_and_secrets_exclusion(self):
        (self.data / ".env").write_text("FAKE_TEST_ONLY")
        for _ in range(3):
            backup = create_backup(self.data, self.root / "backups", retention=2)
        self.assertEqual(len(list((self.root / "backups").glob("*.zip"))), 2)
        with ZipFile(backup) as archive:
            self.assertNotIn("data/.env", archive.namelist())

    def test_credentials_portable_authenticated_and_no_plaintext(self):
        key = "sk-fixture-not-a-real-key-1234567890"
        password = "fixture master password"
        original = self.root / "credentials.vault"
        save_key(original, key, password)
        self.assertNotIn(key.encode(), original.read_bytes())
        moved = self.root / "other-computer" / "credentials.vault"
        moved.parent.mkdir()
        shutil.copyfile(original, moved)
        self.assertEqual(load_key(moved, password), key)
        with self.assertRaisesRegex(ValueError, "Senha incorreta"):
            load_key(moved, "different password")
        content = bytearray(moved.read_bytes())
        content[-1] ^= 1
        moved.write_bytes(content)
        with self.assertRaisesRegex(ValueError, "danificado"):
            load_key(moved, password)

    def test_short_password_and_invalid_key_rejected(self):
        with self.assertRaises(ValueError):
            save_key(self.root / "vault", "sk-invalid", "short")

    def test_restore_recovery_before_new_profile_creation(self):
        import uuid
        from portable_backup import recover_restore

        transaction = uuid.uuid4().hex
        preserved = self.data.with_name("data-before-restore-" + transaction)
        staging = self.data.with_name(".restore-" + transaction)
        staging.mkdir()
        self.data.rename(preserved)
        self.data.mkdir()
        (self.data / "config").mkdir()
        journal = self.data.with_name(".restore-transaction.json")
        journal.write_text(json.dumps({"id": transaction, "data": self.data.name}))
        recover_restore(self.data)
        self.assertTrue((self.data / "registry.db").exists())
        self.assertFalse(journal.exists())

    def install_fixture(self, destination=None, progress=lambda *args: None):
        payload, launcher = self.root / "payload.exe", self.root / "launcher.exe"
        payload.write_bytes(b"fixture-runtime-no-python-or-node")
        launcher.write_bytes(b"fixture-launcher")
        destination = destination or self.root / "usb"
        destination.mkdir(exist_ok=True)
        with patch("portable_install.validate_destination", return_value=destination):
            return install(
                payload,
                launcher,
                destination,
                "2.0.1",
                {"theme": "dark"},
                progress=progress,
            )

    def test_install_empty_and_existing_files_and_update_preserves_data(self):
        destination = self.root / "usb"
        destination.mkdir()
        personal = destination / "personal.txt"
        personal.write_text("preserve")
        root = self.install_fixture(destination)
        self.assertTrue((root / "app/JARVIS.exe").is_file())
        self.assertTrue((destination / "Iniciar JARVIS.exe").is_file())
        self.assertEqual(personal.read_text(), "preserve")
        store = ProjectStore(root / "data")
        chat = store.create_chat(None, "Preservar no update")
        settings = root / "data/config/settings.json"
        settings.write_text('{"theme":"light"}')
        self.install_fixture(destination)
        self.assertEqual(json.loads(settings.read_text())["theme"], "light")
        with database(store.registry) as con:
            self.assertIsNotNone(
                con.execute("SELECT id FROM chats WHERE id=?", (chat["id"],)).fetchone()
            )

    def test_installer_copy_failure_never_marks_new_app_complete(self):
        def interrupt(percent, text):
            if percent >= 70:
                raise OSError("fixture disconnected")

        with self.assertRaises(OSError):
            self.install_fixture(progress=interrupt)
        root = self.root / "usb/JARVIS"
        self.assertFalse((root / "VERSION").exists())
        self.assertFalse((root / "app/JARVIS.exe").exists())
        self.install_fixture()
        self.assertTrue((root / "VERSION").exists())

    def test_install_rejects_unmanaged_folder(self):
        destination = self.root / "usb"
        (destination / "JARVIS").mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, "identificação"):
            self.install_fixture(destination)

    def test_space_and_write_checks(self):
        from portable_install import validate_destination

        with patch.dict(os.environ, {"SystemDrive": "Z:"}), patch(
            "portable_install.removable_drives", return_value=[]
        ), patch(
            "portable_install.shutil.disk_usage",
            return_value=type("Disk", (), {"free": 0})(),
        ):
            with self.assertRaisesRegex(ValueError, "Espaço insuficiente"):
                validate_destination(self.root, 1, manual_confirmed=True)

    def test_interrupted_swap_recovers_old_app_even_same_version(self):
        import uuid

        root = self.install_fixture()
        transaction = str(uuid.uuid4())
        (root / "app").rename(root / (".app-before-" + transaction))
        (root / "app").mkdir()
        (root / "app/JARVIS.exe").write_bytes(b"interrupted")
        (root / ".install-transaction.json").write_text(
            json.dumps({"id": transaction, "version": "2.0.1", "update": True})
        )
        recover_install(root)
        self.assertNotEqual((root / "app/JARVIS.exe").read_bytes(), b"interrupted")
        self.assertTrue((root / (".app-interrupted-" + transaction)).is_dir())


if __name__ == "__main__":
    unittest.main()
