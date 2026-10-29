import asyncio
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import main
import test_jarvis
from project_store import ProjectStore, database
from project_index import ProjectIndexer
from project_chat import ProjectChatService
from programming.security import ReadError


def make_project(root, name="app", marker="ONLY_PROJECT_A"):
    root.mkdir(parents=True, exist_ok=True)
    (root / "package.json").write_text(
        '{"dependencies":{"express":"5"}}', encoding="utf-8"
    )
    (root / "main.py").write_text(
        f'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/{marker}")\ndef route(): return []\n',
        encoding="utf-8",
    )
    (root / "helper.ts").write_text(
        "export function getUsers() { return []; }", encoding="utf-8"
    )
    (root / ".env").write_text(
        "OPENAI_API_KEY=DO_NOT_SEND_PRIVATE_VALUE", encoding="utf-8"
    )
    return root


def snapshot(root):
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file()
    }


def register_selected(store, path):
    project = store.register(path)
    store.set_scope(project["id"], ["."], [])
    return store.project(project["id"])


def fake_client():
    async def create(**kwargs):
        if kwargs.get("response_format"):
            packet = json.loads(kwargs["messages"][-1]["content"])
            content = json.dumps(
                {
                    "files": [
                        {
                            "path": item["path"],
                            "summary": "Interpretação baseada em " + item["path"],
                        }
                        for item in packet
                    ]
                }
            )
        else:
            content = "Hipótese: aplicativo com API. Consulte main.py para evidências."
        result = test_jarvis.completion(content)
        result.usage = SimpleNamespace(
            prompt_tokens=12, completion_tokens=8, total_tokens=20
        )
        return result

    return SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=AsyncMock(side_effect=create))
        )
    )


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.original = make_project(self.base / "originals" / "same")
        self.before = snapshot(self.original)
        self.store = ProjectStore(self.base / "internal")
        self.project = register_selected(self.store, self.original)

    def tearDown(self):
        self.assertEqual(self.before, snapshot(self.original))
        self.temp.cleanup()

    def ready(self, project=None):
        value = project or self.project
        self.store.update_project(value["id"], ready=1)
        return value

    def test_registration_ids_duplicates_windows_case_and_distinct_paths(self):
        duplicate = self.store.register(self.original / ".")
        self.assertEqual(self.project["id"], duplicate["id"])
        self.assertFalse(duplicate["created"])
        same_case = self.store.register(str(self.original).upper())
        self.assertEqual(same_case["id"], self.project["id"])
        other = self.store.register(
            make_project(self.base / "other" / "same", "same", "ONLY_B")
        )
        self.assertNotEqual(other["id"], self.project["id"])
        self.assertNotEqual(
            self.store.db_path(other["id"]), self.store.db_path(self.project["id"])
        )

    def test_multiple_chats_history_isolation_archive_rename_delete_and_restart(self):
        self.ready()
        first = self.store.create_chat(self.project["id"], "Login")
        second = self.store.create_chat(self.project["id"], "Feed")
        self.store.append(first["id"], "user", "FIRST_CHAT_PRIVATE")
        self.assertFalse(self.store.history(second["id"]))
        self.store.change_chat(first["id"], title="Login novo", archived=True)
        self.assertEqual(
            self.store.chats(self.project["id"], True)[0]["title"], "Login novo"
        )
        self.store.change_chat(first["id"], archived=False)
        restored = ProjectStore(self.store.root)
        self.assertEqual(
            restored.history(first["id"])[0]["content"], "FIRST_CHAT_PRIVATE"
        )
        self.store.change_chat(first["id"], delete=True)
        with self.assertRaises(ReadError):
            self.store.chat(first["id"])
        self.assertTrue(self.store.chat(second["id"]))

    def test_initial_chat_blocked_until_ready_or_explicit_partial(self):
        with self.assertRaises(ReadError):
            self.store.create_chat(self.project["id"])
        self.assertEqual(self.store.project(self.project["id"])["knowledge_version"], 0)

    def test_legacy_migration_is_idempotent_and_keeps_original_and_general_history(
        self,
    ):
        old = self.base / "old.db"
        with database(old) as con:
            con.execute(
                "CREATE TABLE messages(id INTEGER PRIMARY KEY,role TEXT,content TEXT)"
            )
            con.executemany(
                "INSERT INTO messages VALUES(?,?,?)",
                [(1, "user", "Old hello"), (2, "assistant", "Old reply")],
            )
        before = old.read_bytes()
        self.store.migrate(old, self.base)
        self.store.migrate(old, self.base)
        rows = self.store.history(self.store.general_chat())
        self.assertEqual([row["content"] for row in rows], ["Old hello", "Old reply"])
        self.assertEqual(old.read_bytes(), before)
        self.assertFalse(self.store.history(self.store.create_chat(None)["id"]))

    def test_remove_registry_retains_memory_and_readd_restores_identity(self):
        self.ready()
        chat = self.store.create_chat(self.project["id"])
        self.store.append(chat["id"], "user", "Keep memory")
        self.store.remove_project(self.project["id"])
        self.assertFalse(self.store.projects())
        self.assertTrue(self.store.db_path(self.project["id"]).is_file())
        readded = self.store.register(self.original)
        self.assertEqual(readded["id"], self.project["id"])
        self.assertEqual(self.store.history(chat["id"])[0]["content"], "Keep memory")

    def test_delete_memory_removes_only_internal_uuid_directory(self):
        self.ready()
        self.store.create_chat(self.project["id"])
        result = self.store.remove_project(self.project["id"], True)
        self.assertTrue(result["original_untouched"])
        self.assertFalse(self.store.project_dir(self.project["id"]).exists())
        self.assertTrue(self.original.is_dir())
        for bad in ["../originals", "C:\\Windows", "not-uuid"]:
            with self.assertRaises(ReadError):
                self.store.project_dir(bad)

    def test_chat_project_tools_cannot_switch_owner_or_read_other_projects(self):
        self.ready()
        chat = self.store.create_chat(self.project["id"])
        service = ProjectChatService(self.store, chat)
        other = make_project(self.base / "other")
        with self.assertRaises(ReadError):
            service.dispatch("select_project", json.dumps({"project": str(other)}))
        with self.assertRaises(ReadError):
            service.dispatch("read_file", json.dumps({"path": str(other / "main.py")}))
        with self.assertRaises(ReadError):
            service.dispatch(
                "read_file", json.dumps({"path": str(self.original / ".env")})
            )

    def test_data_directory_cannot_be_registered_or_read_as_project(self):
        with self.assertRaises(ReadError):
            self.store.register(self.store.root)
        with self.assertRaises(ReadError):
            self.store.register(self.base)


class IndexTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        asyncio.get_running_loop().slow_callback_duration = 1.0
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.original = make_project(self.base / "original")
        self.before = snapshot(self.original)
        self.store = ProjectStore(self.base / "data")
        self.project = register_selected(self.store, self.original)
        self.client = fake_client()
        self.indexer = ProjectIndexer(self.store, self.client, "fake", lambda: True)

    async def asyncTearDown(self):
        await self.indexer.stop()
        self.assertEqual(self.before, snapshot(self.original))
        self.temp.cleanup()

    async def test_initial_knowledge_files_initial_chat_and_usage(self):
        await self.indexer.index(self.project["id"])
        project = self.store.project(self.project["id"])
        self.assertEqual(project["state"], "ready")
        self.assertEqual(project["knowledge_version"], 1)
        idea = self.store.knowledge(project["id"])
        for section in [
            "Objetivo",
            "Materiais e formatos",
            "Organização do projeto",
            "Conteúdos e entregas",
            "Referências e dados",
            "Hipótese",
            "Última análise",
        ]:
            self.assertIn(section, idea)
        directory = self.store.project_dir(project["id"])
        self.assertTrue((directory / "IDEIA.md").is_file())
        self.assertTrue((directory / "arquivos" / "FILE_INDEX.json").is_file())
        file_index = json.loads(
            (directory / "arquivos" / "FILE_INDEX.json").read_text(encoding="utf-8")
        )
        self.assertTrue({"path", "hash", "type", "modified_at"} <= file_index[0].keys())
        self.assertEqual(len(self.store.chats(project["id"])), 1)
        self.assertGreater(project["tokens"], 0)
        self.assertNotIn(
            "DO_NOT_SEND_PRIVATE_VALUE",
            str(self.client.chat.completions.create.call_args_list),
        )

    async def test_unchanged_cache_new_chat_and_knowledge_reuse_make_no_new_ai_calls(
        self,
    ):
        await self.indexer.index(self.project["id"])
        calls = self.client.chat.completions.create.await_count
        chat = self.store.create_chat(self.project["id"], "Other subject")
        self.assertIn(
            "Objetivo",
            ProjectChatService(self.store, chat).dispatch("read_knowledge", "{}")[
                "content"
            ],
        )
        await self.indexer.index(self.project["id"])
        self.assertEqual(self.client.chat.completions.create.await_count, calls)
        self.assertEqual(self.store.project(self.project["id"])["knowledge_version"], 1)

    async def test_incremental_changed_hash_unchanged_cache_and_preserved_decisions(
        self,
    ):
        await self.indexer.index(self.project["id"])
        self.store.note(
            self.project["id"], "decision", "Use SQLite as confirmed by user"
        )
        with database(self.store.db_path(self.project["id"])) as con:
            before = {
                row["path"]: row["hash"]
                for row in con.execute("SELECT path,hash FROM files")
            }
        (self.original / "main.py").write_text(
            "def new_api(): return []", encoding="utf-8"
        )
        self.before = snapshot(self.original)
        calls = self.client.chat.completions.create.await_count
        await self.indexer.index(self.project["id"])
        packets = [
            json.loads(item.kwargs["messages"][-1]["content"])
            for item in self.client.chat.completions.create.call_args_list[calls:]
            if item.kwargs.get("response_format")
        ]
        self.assertEqual(
            [item["path"] for packet in packets for item in packet], ["main.py"]
        )
        self.assertIn("Use SQLite", self.store.knowledge(self.project["id"]))
        with database(self.store.db_path(self.project["id"])) as con:
            after = {
                row["path"]: row["hash"]
                for row in con.execute("SELECT path,hash FROM files")
            }
            self.assertGreater(
                con.execute("SELECT COUNT(*) FROM knowledge_history").fetchone()[0], 2
            )
        self.assertNotEqual(before["main.py"], after["main.py"])
        self.assertEqual(before["helper.ts"], after["helper.ts"])

    async def test_partial_without_api_requires_acceptance(self):
        self.indexer.has_key = lambda: False
        await self.indexer.index(self.project["id"])
        self.assertEqual(self.store.project(self.project["id"])["state"], "partial")
        self.assertFalse(self.store.chats(self.project["id"]))
        self.indexer.accept_partial(self.project["id"])
        self.assertTrue(self.store.chats(self.project["id"]))

    async def test_background_queue_deduplicates_and_recovers_restart(self):
        await self.indexer.start()
        self.indexer.enqueue(self.project["id"])
        self.indexer.enqueue(self.project["id"])
        await self.indexer.queue.join()
        self.assertEqual(self.store.project(self.project["id"])["knowledge_version"], 1)
        await self.indexer.stop()
        restored = ProjectStore(self.store.root)
        self.assertEqual(restored.project(self.project["id"])["state"], "ready")
        self.assertIn("Objetivo", restored.knowledge(self.project["id"]))

    async def test_inaccessible_source_preserves_knowledge_and_chat_access(self):
        await self.indexer.index(self.project["id"])
        previous = self.store.knowledge(self.project["id"])
        await self.indexer.start()
        with patch.object(self.indexer, "scan", side_effect=ReadError("Inacessível")):
            self.indexer.enqueue(self.project["id"])
            await self.indexer.queue.join()
        self.assertEqual(self.store.project(self.project["id"])["state"], "unavailable")
        self.assertEqual(self.store.knowledge(self.project["id"]), previous)
        self.assertTrue(self.store.chats(self.project["id"]))

    async def test_deleted_files_update_index_and_note_only_update_uses_no_ai(self):
        await self.indexer.index(self.project["id"])
        (self.original / "helper.ts").unlink()
        self.before = snapshot(self.original)
        await self.indexer.index(self.project["id"])
        with database(self.store.db_path(self.project["id"])) as con:
            self.assertFalse(
                con.execute("SELECT 1 FROM files WHERE path='helper.ts'").fetchone()
            )
        calls = self.client.chat.completions.create.await_count
        self.store.note(self.project["id"], "idea", "Improve UX later")
        self.indexer.publish(self.project["id"], False)
        self.assertEqual(calls, self.client.chat.completions.create.await_count)
        self.assertIn("Improve UX later", self.store.knowledge(self.project["id"]))

    async def test_interrupted_export_recovers_version_without_losing_previous_history(
        self,
    ):
        with patch.object(
            self.store, "export_knowledge", side_effect=OSError("Unavailable")
        ):
            with self.assertRaises(OSError):
                await self.indexer.index(self.project["id"])
        await self.indexer.index(self.project["id"])
        self.assertEqual(self.store.project(self.project["id"])["state"], "ready")
        self.assertGreater(
            self.store.project(self.project["id"])["knowledge_version"], 1
        )
        self.assertTrue(
            (self.store.project_dir(self.project["id"]) / "IDEIA.md").is_file()
        )

    async def test_pending_work_recovers_on_restart_and_debounces(self):
        self.store.update_project(self.project["id"], state="indexing")
        self.store = ProjectStore(self.store.root)
        self.assertEqual(self.store.project(self.project["id"])["state"], "interrupted")
        self.indexer = ProjectIndexer(self.store, self.client, "fake", lambda: True)
        await self.indexer.start()
        await self.indexer.queue.join()
        self.assertEqual(self.store.project(self.project["id"])["state"], "ready")
        self.indexer.enqueue(self.project["id"], debounce=True)
        self.assertTrue(self.indexer.queue.empty())

    async def test_user_notes_survive_large_idea_and_internal_complementary_files(self):
        await self.indexer.index(self.project["id"])
        self.store.note(self.project["id"], "decision", "Confirmed design decision")
        self.store.note(self.project["id"], "problem", "User reported failure")
        self.store.note(self.project["id"], "idea", "Unimplemented improvement")
        self.indexer.publish(self.project["id"], False)
        self.assertIn(
            "Confirmed design decision",
            self.store.knowledge_context(self.project["id"]),
        )
        self.assertIn(
            "User reported", self.store.knowledge(self.project["id"], "PROBLEMS.md")
        )
        self.assertIn(
            "Unimplemented", self.store.knowledge(self.project["id"], "FEATURES.md")
        )

    async def test_dependency_changes_invalidate_transitive_dependents_only(self):
        (self.original / "controller.ts").write_text(
            'import { getUsers } from "./helper";\nexport const users = getUsers();',
            encoding="utf-8",
        )
        (self.original / "page.ts").write_text(
            'import { users } from "./controller";', encoding="utf-8"
        )
        self.before = snapshot(self.original)
        await self.indexer.index(self.project["id"])
        calls = self.client.chat.completions.create.await_count
        (self.original / "helper.ts").write_text(
            "export function getUsers() { return [1]; }", encoding="utf-8"
        )
        self.before = snapshot(self.original)
        await self.indexer.index(self.project["id"])
        batches = [
            json.loads(item.kwargs["messages"][-1]["content"])
            for item in self.client.chat.completions.create.call_args_list[calls:]
            if item.kwargs.get("response_format")
        ]
        self.assertEqual(
            {item["path"] for batch in batches for item in batch},
            {"helper.ts", "controller.ts", "page.ts"},
        )


class ProjectAPITests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)
        self.root = Path(self.temp.name)
        self.original = make_project(self.root / "original")
        self.project = register_selected(main.store, self.original)
        main.store.update_project(self.project["id"], ready=1, state="ready")

    def tearDown(self):
        test_jarvis.JarvisTests.tearDown(self)

    def test_chat_history_and_idea_are_isolated_in_model_context(self):
        other = register_selected(
            main.store, make_project(self.root / "other", marker="ONLY_B")
        )
        main.store.update_project(other["id"], ready=1, state="ready")
        first = main.store.create_chat(self.project["id"], "A")
        second = main.store.create_chat(other["id"], "B")
        main.store.append(first["id"], "user", "PRIVATE_CHAT_A")
        main.store.append(second["id"], "user", "PRIVATE_CHAT_B")
        with database(main.store.db_path(other["id"])) as con:
            con.execute(
                "INSERT INTO knowledge VALUES('IDEIA.md',?,1,'now')", ("B_KNOWLEDGE",)
            )
        create = AsyncMock(return_value=test_jarvis.completion("Reply for B"))
        with patch.object(main.client.chat.completions, "create", create):
            response = self.client.post(
                "/chat", json={"chat_id": second["id"], "message": "What do you know?"}
            )
        self.assertEqual(response.status_code, 200)
        sent = json.dumps(create.call_args.kwargs["messages"])
        self.assertNotIn("PRIVATE_CHAT_A", sent)
        self.assertIn("PRIVATE_CHAT_B", sent)
        self.assertIn("B_KNOWLEDGE", sent)
        self.assertEqual(
            self.client.get("/chats/history", params={"chat_id": second["id"]}).json()[
                "messages"
            ][-1]["content"],
            "Reply for B",
        )

    def test_sidebar_catalog_lists_metadata_without_histories_or_removed_projects(self):
        general = main.store.create_chat(None, "General discussion")
        project_chat = main.store.create_chat(self.project["id"], "Login investigation")
        main.store.append(project_chat["id"], "user", "HISTORY_NOT_IN_SIDEBAR")
        data = self.client.get("/workspace").json()
        self.assertIn(project_chat["id"], [item["id"] for item in data["chats"]])
        self.assertIn(general["id"], [item["id"] for item in data["chats"]])
        self.assertNotIn("HISTORY_NOT_IN_SIDEBAR", json.dumps(data))
        self.client.post(
            "/projects/remove",
            json={
                "project_id": self.project["id"],
                "confirmed": True,
                "delete_memory": False,
            },
        )
        data = self.client.get("/workspace").json()
        self.assertNotIn(project_chat["id"], [item["id"] for item in data["chats"]])
        self.assertIn(general["id"], [item["id"] for item in data["chats"]])

    def test_destructive_operations_require_confirmation_and_original_is_untouched(
        self,
    ):
        chat = main.store.create_chat(self.project["id"])
        for route, body in [
            ("/projects/remove", {"project_id": self.project["id"]}),
            ("/chats/change", {"chat_id": chat["id"], "delete": True}),
        ]:
            self.assertEqual(self.client.post(route, json=body).status_code, 400)
        before = snapshot(self.original)
        response = self.client.post(
            "/projects/remove",
            json={
                "project_id": self.project["id"],
                "confirmed": True,
                "delete_memory": True,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(before, snapshot(self.original))

    def test_selection_and_reopening_use_no_ai_until_explicit_memory_refresh(self):
        source = make_project(self.root / "new-project")
        fake = fake_client()
        main.indexer.client = fake
        response = self.client.post("/projects/register", json={"path": str(source)})
        self.assertEqual(response.status_code, 200)
        project_id = response.json()["id"]
        self.assertFalse(fake.chat.completions.create.await_count)
        self.assertFalse(main.indexer.pending)
        self.assertEqual(
            self.client.post(
                "/projects/selection/save",
                json={"project_id": project_id, "include": ["."], "exclude": []},
            ).status_code,
            200,
        )
        self.assertFalse(fake.chat.completions.create.await_count)
        self.assertFalse(main.indexer.pending)
        self.assertEqual(main.store.project(project_id)["state"], "selecting")
        self.assertEqual(self.client.post("/workspace/view", json={"project_id":project_id}).status_code, 200)
        self.assertFalse(fake.chat.completions.create.await_count)
        self.assertFalse(main.indexer.pending)
        self.assertEqual(self.client.post("/projects/refresh", json={"project_id":project_id}).status_code, 200)
        self.client.portal.call(main.indexer.queue.join)
        self.assertTrue(main.store.project(project_id)["ready"])
        calls = fake.chat.completions.create.await_count
        self.assertEqual(
            self.client.post("/projects/register", json={"path": str(source)}).json()[
                "id"
            ],
            project_id,
        )
        self.client.portal.call(main.indexer.queue.join)
        self.assertEqual(fake.chat.completions.create.await_count, calls)

    def test_new_chat_in_active_project_does_not_start_full_or_hash_analysis(self):
        main.indexer.active_project = self.project["id"]
        with patch.object(main.indexer, "enqueue") as enqueue:
            self.assertEqual(
                self.client.post(
                    "/chats/create", json={"project_id": self.project["id"]}
                ).status_code,
                200,
            )
            self.assertEqual(
                self.client.post(
                    "/workspace/view", json={"project_id": self.project["id"]}
                ).status_code,
                200,
            )
        enqueue.assert_not_called()

    def test_general_chat_and_voice_redact_recognizable_secrets_before_sending(self):
        create = AsyncMock(return_value=test_jarvis.completion("Resposta segura"))
        with patch.object(main.client.chat.completions, "create", create):
            self.assertEqual(
                self.client.post(
                    "/chat", json={"message": 'api_key = "PRIVATE-TEST-VALUE"'}
                ).status_code,
                200,
            )
        self.assertNotIn(
            "PRIVATE-TEST-VALUE", json.dumps(create.call_args.kwargs["messages"])
        )
        voice = AsyncMock(return_value=SimpleNamespace(content=b"mp3"))
        with patch.object(main.client.audio.speech, "create", voice):
            self.client.post(
                "/speak", json={"message": 'password = "PRIVATE-VOICE-VALUE"'}
            )
        self.assertNotIn("PRIVATE-VOICE-VALUE", voice.call_args.kwargs["input"])


if __name__ == "__main__":
    unittest.main()
