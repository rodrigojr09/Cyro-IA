import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
import subprocess
import base64
from unittest.mock import patch

import protected_storage as storage
from secure_vault import save_key, load_bundle
from project_store import ProjectStore, database, atomic_text
from portable_backup import create_backup, restore_backup, decode_backup
from guided_migration import migrate, inventory


class ProtectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.addCleanup(storage.configure)
        self.root = Path(self.temporary.name)
        self.data = self.root / "JARVIS/data"
        self.data.mkdir(parents=True)
        self.vault = self.data / "config/credentials.vault"
        save_key(
            self.vault, "sk-fixture-only-not-a-real-key-123", "fixture master password"
        )
        self.bundle = load_bundle(self.vault, "fixture master password")
        self.key = self.bundle["data_key"]
        storage.configure(self.data, self.key)
        self.store = ProjectStore(self.data)

    def snapshot(self, root):
        return {
            str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*")
            if p.is_file()
        }

    def test_conversations_documents_preferences_and_reopen(self):
        marker = "PRIVATE_TEXT_THAT_MUST_NEVER_APPEAR_ON_DISK"
        chat = self.store.create_chat(None, marker)
        self.store.append(chat["id"], "user", marker)
        atomic_text(self.data / "private.md", marker)
        storage.write_text(
            self.data / "config/settings.json", json.dumps({"display_name": marker})
        )
        for path in self.data.rglob("*"):
            if path.is_file():
                self.assertNotIn(marker.encode(), path.read_bytes())
                self.assertFalse(path.read_bytes().startswith(b"SQLite format 3"))
        reopened = ProjectStore(self.data)
        self.assertEqual(reopened.history(chat["id"])[0]["content"], marker)
        self.assertEqual(storage.read_text(self.data / "private.md"), marker)

    def test_transactions_rollback_and_atomic_replace_failure(self):
        before = self.store.registry.read_bytes()
        with self.assertRaises(RuntimeError):
            with database(self.store.registry) as con:
                con.execute("INSERT INTO settings VALUES('fixture','sensitive')")
                raise RuntimeError("interruption")
        self.assertEqual(self.store.registry.read_bytes(), before)
        with patch("secure_vault.os.replace", side_effect=OSError("USB disconnected")):
            with self.assertRaises(OSError):
                self.store.create_chat(None, "must not commit")
        self.assertEqual(self.store.registry.read_bytes(), before)
        self.assertEqual(list(self.data.glob(".jarvis-*.tmp")), [])

    def test_concurrent_writers_no_lost_updates(self):
        def append(index):
            with database(self.store.registry) as con:
                con.execute(
                    "INSERT INTO settings VALUES(?,?)", (f"thread{index}", str(index))
                )

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(append, range(20)))
        with database(self.store.registry) as con:
            self.assertEqual(
                con.execute(
                    "SELECT COUNT(*) FROM settings WHERE key LIKE 'thread%'"
                ).fetchone()[0],
                20,
            )

    def test_ciphertext_wrong_key_tampering_and_path_binding_fail_closed(self):
        file = self.data / "secret.json"
        storage.write_text(file, "private")
        raw = file.read_bytes()
        other = self.data / "other.json"
        other.write_bytes(raw)
        with self.assertRaisesRegex(ValueError, "autenticação"):
            storage.read_text(other)
        corrupted = bytearray(raw)
        corrupted[-1] ^= 1
        file.write_bytes(corrupted)
        with self.assertRaisesRegex(ValueError, "autenticação"):
            storage.read_text(file)
        file.write_bytes(raw)
        with storage.session(self.data, os.urandom(32)):
            with self.assertRaises(ValueError):
                storage.read_text(file)

    def test_sqlite_disk_attach_is_rejected(self):
        with database(self.store.registry) as con:
            with self.assertRaises(sqlite3.DatabaseError):
                con.execute(
                    "ATTACH DATABASE ? AS outside", (str(self.root / "leak.db"),)
                )
        self.assertFalse((self.root / "leak.db").exists())

    def test_change_master_password_preserves_data_key(self):
        chat = self.store.create_chat(None, "keep")
        save_key(
            self.vault,
            "sk-other-fixture-key-1234567890",
            "new fixture password",
            self.key,
        )
        self.assertEqual(
            load_bundle(self.vault, "new fixture password")["data_key"], self.key
        )
        with self.assertRaises(ValueError):
            load_bundle(self.vault, "fixture master password")
        with self.assertRaises(ValueError):
            save_key(
                self.vault, "sk-other-fixture-key-1234567890", "new fixture password"
            )
        self.assertEqual(self.store.chat(chat["id"])["title"], "keep")

    def test_encrypted_backup_restore_and_password_corruption(self):
        chat = self.store.create_chat(None, "SECRET_BACKUP_CHAT")
        backup = create_backup(self.data, self.root / "backups")
        self.assertEqual(backup.suffix, ".jbackup")
        self.assertNotIn(b"SECRET_BACKUP_CHAT", backup.read_bytes())
        with self.assertRaises(ValueError):
            decode_backup(backup.read_bytes(), password="wrong fixture password")
        self.store.create_chat(None, "newer")
        previous = restore_backup(
            backup, self.data, confirmed=True, password="fixture master password"
        )
        self.assertTrue(previous.is_dir())
        self.assertEqual(
            ProjectStore(self.data).chat(chat["id"])["title"], "SECRET_BACKUP_CHAT"
        )
        corrupted = bytearray(backup.read_bytes())
        corrupted[-1] ^= 1
        backup.write_bytes(corrupted)
        before = self.snapshot(self.data)
        with self.assertRaises(ValueError):
            restore_backup(backup, self.data, confirmed=True)
        self.assertEqual(before, self.snapshot(self.data))

    def test_data_survives_relocation(self):
        chat = self.store.create_chat(None, "relocated")
        moved = self.root / "other-drive/data"
        moved.parent.mkdir()
        shutil.copytree(self.data, moved)
        with storage.session(moved, self.key):
            self.assertEqual(ProjectStore(moved).chat(chat["id"])["title"], "relocated")

    def test_electron_python_encryption_interoperability(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node necessário somente no ambiente de desenvolvimento")
        storage.write_text(
            self.data / "config/settings.json", '{"display_name":"fixture"}'
        )
        module = Path(__file__).resolve().parents[1] / "desktop/scripts/session/encrypted-state.js"
        script = "const fs=require('node:fs');const p=require('node:path');const input=JSON.parse(fs.readFileSync(0,'utf8'));const store=require(process.argv[1]).create(input.root,input.key);if(store.readJSON(p.join(input.root,'config/settings.json')).display_name!=='fixture')process.exit(2);store.writeJSON(p.join(input.root,'config/browser-state.json'),{draft:'private fixture draft'});"
        subprocess.run(
            [node, "-e", script, str(module)],
            input=json.dumps(
                {"root": str(self.data), "key": base64.b64encode(self.key).decode()}
            ),
            text=True,
            check=True,
            capture_output=True,
        )
        self.assertEqual(
            json.loads(storage.read_text(self.data / "config/browser-state.json"))[
                "draft"
            ],
            "private fixture draft",
        )

    def test_migration_preserves_source_and_encrypted_backups(self):
        source = self.root / "legacy"
        with storage.session(None, None):
            old = ProjectStore(source)
            chat = old.create_chat(None, "MIGRATE_PRIVATE_CHAT")
            old.append(chat["id"], "user", "MIGRATE_PRIVATE_MESSAGE")
        before = self.snapshot(source)
        with self.assertRaises(ValueError):
            migrate(source, self.data, self.key)
        result = migrate(source, self.data, self.key, confirmed=True)
        self.assertEqual(before, self.snapshot(source))
        self.assertEqual(
            ProjectStore(self.data).history(chat["id"])[0]["content"],
            "MIGRATE_PRIVATE_MESSAGE",
        )
        self.assertTrue(result["backup"].is_file())
        for path in [*self.data.rglob("*"), *(self.root / "JARVIS/backups").glob("*")]:
            if path.is_file():
                self.assertNotIn(b"MIGRATE_PRIVATE_MESSAGE", path.read_bytes())

    def test_migration_failure_leaves_destination_and_origin(self):
        source = self.root / "legacy"
        with storage.session(None, None):
            ProjectStore(source)
        source_before, target_before = self.snapshot(source), self.snapshot(self.data)
        with patch(
            "guided_migration.encode_backup", side_effect=OSError("fixture device lost")
        ):
            with self.assertRaises(OSError):
                migrate(source, self.data, self.key, confirmed=True)
        self.assertEqual(source_before, self.snapshot(source))
        self.assertEqual(target_before, self.snapshot(self.data))


if __name__ == "__main__":
    unittest.main()
