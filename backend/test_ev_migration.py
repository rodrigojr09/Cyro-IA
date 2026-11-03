"""v7 -> v8 catalog migration on disposable databases; no personal profiles."""
import tempfile
import unittest
from pathlib import Path

from project_store import ProjectStore, database


class EVMigrationTests(unittest.TestCase):
    def test_v7_catalog_defaults_to_general_without_losing_chat_or_memory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sources = root / "sources"
            sources.mkdir()
            (sources / "note.txt").write_text("original", encoding="utf-8")
            store = ProjectStore(root / "internal")
            project = store.register(sources, "Projeto antigo")
            store.set_scope(project["id"], ["."], [])
            store.update_project(project["id"], ready=1)
            chat = store.create_chat(project["id"], "Conversa preservada")
            store.append(chat["id"], "user", "Conteúdo preservado")
            # Reproduce the v7 schema in this disposable fixture only.
            with database(store.registry) as con:
                con.execute("ALTER TABLE projects DROP COLUMN category")
                con.execute("PRAGMA user_version=3")
            before = store.history(chat["id"])
            migrated = ProjectStore(root / "internal")
            self.assertEqual(migrated.project(project["id"])["category"], "GENERAL")
            self.assertEqual(migrated.project(project["id"])["name"], "Projeto antigo")
            self.assertEqual(migrated.history(chat["id"]), before)
            self.assertEqual(migrated.chat(chat["id"])["project_id"], project["id"])
            again = ProjectStore(root / "internal")
            self.assertEqual(again.history(chat["id"]), before)
            self.assertEqual((sources / "note.txt").read_text(encoding="utf-8"), "original")

    def test_database_rejects_unknown_categories(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sources = root / "sources"
            sources.mkdir()
            store = ProjectStore(root / "internal")
            project = store.register(sources)
            with self.assertRaises(sqlite3.IntegrityError):
                with database(store.registry) as con:
                    con.execute("UPDATE projects SET category=? WHERE id=?", ("UNKNOWN", project["id"]))
