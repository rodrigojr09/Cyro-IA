import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from project_store import ProjectStore
from project_scope import MAX_PROJECT_BYTES
from project_index import ProjectIndexer
from programming.security import ReadError
import main
import test_jarvis
from unittest.mock import patch


class ProjectLimitApiTests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)

    def tearDown(self):
        test_jarvis.JarvisTests.tearDown(self)

    def test_bypassing_desktop_preflight_is_rejected_by_server_without_ai(self):
        root = Path(self.temp.name) / "study"
        root.mkdir()
        source = root / "notes.txt"
        source.write_text("História e estudos", encoding="utf-8")
        project = main.store.register(root)
        main.store.set_scope(project["id"], ["."], [])
        main.store.update_project(project["id"], ready=1, state="ready")
        chat = main.store.create_chat(project["id"], "Estudo")
        source.write_bytes(b"x" * (MAX_PROJECT_BYTES + 1))
        result = self.client.post(
            "/projects/selection/size", json={"project_id": project["id"]}
        )
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json()["within_limit"])
        self.assertTrue(result.json()["metadata_only"])
        create = AsyncMock(side_effect=AssertionError("No AI call allowed"))
        with patch.object(main.client.chat.completions, "create", create):
            for route, payload in [
                (
                    "/projects/selection/save",
                    {"project_id": project["id"], "include": ["."], "exclude": []},
                ),
                ("/projects/refresh", {"project_id": project["id"]}),
                ("/chat", {"chat_id": chat["id"], "message": "Leia minhas notas"}),
                (
                    "/quick/chat",
                    {"project_id": project["id"], "message": "Leia minhas notas"},
                ),
            ]:
                response = self.client.post(route, json=payload)
                self.assertEqual(response.status_code, 413, (route, response.text))
            with patch.object(main, "CLOUD", True):
                response = self.client.post(
                    "/chat/stream",
                    json={"chat_id": chat["id"], "message": "Leia minhas notas"},
                )
                self.assertEqual(response.status_code, 413)
        self.assertEqual(create.await_count, 0)


class ProjectLimitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "study"
        self.root.mkdir()
        self.store = ProjectStore(Path(self.temp.name) / "data")
        self.project = self.store.register(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_total_exact_limit_and_overlapping_rules_count_once(self):
        (self.root / "notes.txt").write_bytes(b"a" * MAX_PROJECT_BYTES)
        result = self.store.set_scope(self.project["id"], [".", "notes.txt"], [])
        self.assertEqual(result["selected_bytes"], MAX_PROJECT_BYTES)
        self.assertEqual(
            self.store.validate_project_size(self.project["id"]), MAX_PROJECT_BYTES
        )
        self.assertEqual(
            len(
                self.store.read_policy(self.project["id"]).snapshot(
                    "notes.txt", self.root
                )[1]
            ),
            MAX_PROJECT_BYTES,
        )
        (self.root / "extra.csv").write_bytes(b"x")
        with self.assertRaisesRegex(ReadError, "ultrapassa 5 MB"):
            self.store.validate_project_size(self.project["id"])

    def test_total_over_limit_rejected_before_saving_selection_and_exclusion_works(
        self,
    ):
        (self.root / "first.txt").write_bytes(b"a" * (3 * 1024 * 1024))
        (self.root / "second.csv").write_bytes(b"b" * (3 * 1024 * 1024))
        with self.assertRaisesRegex(ReadError, "5 MB"):
            self.store.set_scope(self.project["id"], ["."], [])
        self.assertFalse(self.store.scope(self.project["id"])["confirmed"])
        self.store.set_scope(self.project["id"], ["."], ["second.csv"])
        self.assertEqual(
            self.store.validate_project_size(self.project["id"]), 3 * 1024 * 1024
        )

    def test_growth_blocks_analysis_before_ai_and_cannot_accept_partial(self):
        (self.root / "notes.txt").write_text(
            "Plano de estudo de história", encoding="utf-8"
        )
        self.store.set_scope(self.project["id"], ["."], [])
        (self.root / "notes.txt").write_bytes(b"a" * (MAX_PROJECT_BYTES + 1))
        create = AsyncMock(side_effect=AssertionError("No paid call allowed"))
        index = ProjectIndexer(
            self.store,
            SimpleNamespace(
                chat=SimpleNamespace(completions=SimpleNamespace(create=create))
            ),
            "test",
            lambda: True,
        )
        asyncio.run(index.index(self.project["id"]))
        self.assertEqual(create.await_count, 0)
        self.assertEqual(self.store.project(self.project["id"])["state"], "blocked")
        with self.assertRaises(ReadError):
            index.accept_partial(self.project["id"])

    def test_non_programming_material_and_notes_only_projects(self):
        self.store.set_scope(self.project["id"], [], [])
        index = ProjectIndexer(self.store, None, "test", lambda: False)
        asyncio.run(index.index(self.project["id"]))
        self.store.note(
            self.project["id"],
            "information",
            "Organizar as leituras de história para a prova",
        )
        index.publish(self.project["id"], False)
        idea = self.store.knowledge(self.project["id"])
        self.assertIn("leituras de história", idea)
        self.assertIn("Organização do projeto", idea)
        self.assertTrue(self.store.chats(self.project["id"]))


if __name__ == "__main__":
    unittest.main()
