import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch, AsyncMock

import cloud_client
import main
import test_jarvis
from cloud_conversations import CloudConversations
from project_store import ProjectStore, database
from test_projects import make_project, register_selected
from programming.security import ReadError


class ProjectChatBindingTests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)

    def tearDown(self):
        test_jarvis.JarvisTests.tearDown(self)

    def test_project_context_cannot_be_attached_to_cloud_or_ordinary_project_chat(self):
        local = main.store
        project = register_selected(
            local, make_project(Path(self.temp.name) / "source")
        )
        local.update_project(project["id"], ready=1, state="ready")
        ordinary = local.create_chat(project["id"], "Local")
        cloud_id = str(uuid.uuid4())

        def request(command):
            if command["action"] == "storage":
                return {"blocked": False}
            if command["action"] == "get":
                return {"id": cloud_id, "project_id": None, "archived": 0}
            if command["action"] == "fixed":
                return {"id": cloud_id}
            self.fail("Project data must not be sent to Cloud storage")

        with patch.object(main, "CLOUD", True), patch.object(
            main, "store", CloudConversations(local, request)
        ), patch.object(main, "configured_key", return_value="session"):
            for chat_id in [cloud_id, ordinary["id"]]:
                response = self.client.post(
                    "/chat",
                    json={
                        "chat_id": chat_id,
                        "quick_project_id": project["id"],
                        "message": "Não misturar contextos",
                    },
                )
                self.assertEqual(response.status_code, 400, response.text)

    def test_cloud_reply_is_only_returned_after_exchange_commit_and_storage_failure_hides_it(
        self,
    ):
        chat_id = str(uuid.uuid4())
        calls = []
        fail = False

        def request(command):
            calls.append(command["action"])
            if command["action"] == "storage":
                return {"blocked": False}
            if command["action"] == "get":
                return {
                    "id": chat_id,
                    "project_id": None,
                    "archived": 0,
                    "summary": "",
                    "slot": None,
                }
            if command["action"] == "history":
                return []
            if command["action"] == "exchange":
                if fail:
                    raise ReadError("Falha ao salvar no servidor")
                return {
                    "ok": True,
                    "chat": {"id": chat_id},
                    "messages": [
                        {"id": 1, "role": "user", "content": "Question"},
                        {"id": 2, "role": "assistant", "content": "Durable answer"},
                    ],
                }
            self.fail("Unexpected storage request")

        with patch.object(main, "CLOUD", True), patch.object(
            main, "store", CloudConversations(main.store, request)
        ), patch.object(main, "configured_key", return_value="session"), patch.object(
            main, "converse", AsyncMock(return_value=("Durable answer", []))
        ), patch(
            "spotify_commands.try_command", AsyncMock(return_value=None)
        ):
            response = self.client.post(
                "/chat", json={"chat_id": chat_id, "message": "Question"}
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(calls[-1], "exchange")
            self.assertEqual(response.json()["reply"], "Durable answer")
            self.assertTrue(response.json()["persisted"]["ok"])
            self.assertNotIn("append", calls)
            self.assertNotIn("fixed", calls)
            fail = True
            response = self.client.post(
                "/chat", json={"chat_id": chat_id, "message": "Question"}
            )
            self.assertNotEqual(response.status_code, 200)
            self.assertNotIn("Durable answer", response.text)

    def test_lost_response_recovers_same_saved_exchange_without_another_model_call(self):
        chat_id, operation = str(uuid.uuid4()), str(uuid.uuid4())
        rows, calls = [], []
        first = True
        def request(command):
            nonlocal first
            calls.append(command)
            if command["action"] == "storage": return {"blocked": False}
            if command["action"] == "get": return {"id": chat_id, "project_id": None, "archived": 0, "summary": "", "slot": None}
            if command["action"] == "receipt":
                return {"ready": len(rows) == 2, "userMessageId": rows[0]["id"] if rows else None, "userContent": rows[0]["content"] if rows else None, "reply": "Resposta salva.", "persisted": {"chat": {"id": chat_id}, "messages": rows.copy()}}
            if command["action"] == "history": return rows.copy()
            if command["action"] == "append":
                self.assertEqual(command["requestId"], operation)
                if not rows: rows.append({"id": 1, "role": "user", "content": command["content"]})
                return {"id": 1}
            if command["action"] == "exchange":
                self.assertTrue(command["userAlreadyStored"])
                rows.append({"id": 2, "role": "assistant", "content": command["assistant"]})
                if first:
                    first = False
                    raise ReadError("Conexão interrompida depois da gravação")
                return {"chat": {"id": chat_id}, "messages": rows.copy()}
            self.fail("Unexpected request " + command["action"])
        async def answer(*args):
            self.assertEqual(rows[0]["role"], "user")
            return "Resposta salva.", []
        with patch.object(main, "CLOUD", True), patch.object(main, "store", CloudConversations(main.store, request)), patch.object(main, "configured_key", return_value="session"), patch.object(main, "converse", AsyncMock(side_effect=answer)) as model, patch("spotify_commands.try_command", AsyncMock(return_value=None)):
            body = {"chat_id": chat_id, "operation_id": operation, "message": "Questão persistente"}
            first_reply = self.client.post("/chat", json=body)
            self.assertNotEqual(first_reply.status_code, 200)
            second = self.client.post("/chat", json=body)
            self.assertEqual(second.status_code, 200, second.text)
            self.assertEqual(second.json()["reply"], "Resposta salva.")
            self.assertEqual(model.call_count, 1)
            self.assertEqual(len(rows), 2)
            self.assertEqual(len([c for c in calls if c["action"] == "append"]), 1)

    def test_indexing_progress_never_requests_cloud_catalog(self):
        def request(command):
            self.fail("Local progress must not query Cloud")

        with patch.object(main, "CLOUD", True), patch.object(
            main, "store", CloudConversations(main.store, request)
        ):
            response = self.client.get("/workspace/progress")
            self.assertEqual(response.status_code, 200)
            self.assertIn("projects", response.json())

    def test_general_view_uses_one_cloud_list_for_active_and_archived(self):
        calls = []

        def request(command):
            calls.append(command)
            return []

        with patch.object(main, "CLOUD", True), patch.object(
            main, "store", CloudConversations(main.store, request)
        ):
            response = self.client.post("/workspace/view", json={"project_id": None})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["chats"], [])
            self.assertEqual(response.json()["archived_chats"], [])
        self.assertEqual(calls, [{"action": "list"}])


class CloudConversationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.local = ProjectStore(Path(self.temp.name) / "data")
        self.calls = []
        self.owner = "account-a"
        self.fixed = {}
        self.rows = {}

        def request(command):
            self.calls.append(command)
            if command["action"] == "fixed":
                key = (self.owner, command["slot"])
                self.fixed.setdefault(key, str(uuid.uuid4()))
                return {"id": self.fixed[key]}
            if command["action"] == "get":
                return {"id": command["id"], "project_id": None, "archived": 0}
            if command["action"] == "history":
                return self.rows.get((self.owner, command["id"]), [])
            if command["action"] == "append":
                self.rows.setdefault((self.owner, command["id"]), []).append(
                    {"role": command["role"], "content": command["content"]}
                )
                return {"id": len(self.rows[(self.owner, command["id"])])}
            return []

        self.request = request
        self.store = CloudConversations(self.local, request)

    def tearDown(self):
        self.temp.cleanup()

    def test_bootstrap_loads_only_metadata_and_never_creates_general_or_downloads_histories(self):
        quick_id, chat_id = str(uuid.uuid4()), str(uuid.uuid4())
        calls = []
        def request(command):
            calls.append(command)
            if command["action"] == "fixed":
                self.assertEqual(command["slot"], "quick")
                self.assertTrue(command["metadataOnly"])
                return {"id": quick_id, "slot": "quick", "project_id": None}
            self.assertEqual(command["action"], "catalog")
            return {"chats": [{"id": chat_id, "slot": None, "project_id": None}], "next": 30}
        store = CloudConversations(self.local, request)
        general, chats, histories = store.bootstrap()
        self.assertIsNone(general)
        self.assertEqual(histories, {})
        self.assertEqual(len(chats), 2)
        self.assertEqual(store.catalog_next, 30)
        self.assertEqual([c["action"] for c in calls], ["fixed", "catalog"])

    def test_exchange_uses_one_request_with_two_stable_distinct_ids(self):
        self.store.append_exchange(str(uuid.uuid4()), "question", "answer")
        self.assertEqual(len(self.calls), 1)
        command = self.calls[0]
        self.assertEqual(command["action"], "exchange")
        self.assertNotEqual(command["requestId"], command["assistantRequestId"])
        self.assertEqual(
            (command["user"], command["assistant"]), ("question", "answer")
        )

    def test_fixed_quick_reused_after_reconstruction_and_account_switch(self):
        first = self.store.quick_chat()
        self.store.append(first, "user", "Cloud history A")
        self.assertEqual(
            CloudConversations(self.local, self.request).quick_chat(), first
        )
        self.owner = "account-b"
        second = self.store.quick_chat()
        self.assertNotEqual(first, second)
        self.assertEqual(self.store.history(second), [])
        self.owner = "account-a"
        self.assertEqual(self.store.quick_chat(), first)
        self.assertEqual(self.store.history(first)[0]["content"], "Cloud history A")

    def test_legacy_project_data_is_preserved_but_cannot_create_or_mutate_through_cloud(self):
        from programming.security import ReadError
        project = register_selected(self.local, make_project(Path(self.temp.name) / "source"))
        self.local.update_project(project["id"], ready=1, state="ready")
        chat = self.local.create_chat(project["id"], "Legado")
        self.local.append(chat["id"], "user", "LOCAL_PROJECT_SECRET")
        for operation in [
            lambda: self.store.create_chat(project["id"], "Novo"),
            lambda: self.store.project_quick_chat(project["id"]),
            lambda: self.store.chat(chat["id"]),
            lambda: self.store.history(chat["id"]),
            lambda: self.store.change_chat(chat["id"], delete=True),
        ]:
            with self.assertRaises(ReadError):
                operation()
        self.assertEqual(self.local.history(chat["id"])[0]["content"], "LOCAL_PROJECT_SECRET")
        self.assertEqual(self.calls, [])

    def test_old_local_general_history_and_references_are_never_uploaded(self):
        self.local.append(self.local.general_chat(), "user", "LEGACY_PRIVATE_MESSAGE")
        with self.assertRaises(ReadError):
            self.store.general_chat()
        general = str(uuid.uuid4())
        self.assertEqual(self.store.history(general), [])
        self.store.save_context(
            general, {"project": "C:/private", "references": ["secret"]}
        )
        self.assertIsNone(self.store.context(general))
        self.assertNotIn("LEGACY_PRIVATE_MESSAGE", str(self.calls))
        self.assertNotIn("C:/private", str(self.calls))
        with database(self.local.db_path()) as con:
            self.assertEqual(
                con.execute("SELECT count(*) FROM messages").fetchone()[0], 1
            )

    def test_retry_keeps_same_message_request_id_and_hides_provider_errors(self):
        import httpx

        cloud_client.configure("https://example.test", "a" * 43)
        requests = []

        def post(url, **kwargs):
            requests.append(kwargs["json"].copy())
            if len(requests) == 1:
                raise httpx.ReadTimeout("private diagnostic")
            return httpx.Response(
                200, json={"ok": True}, request=httpx.Request("POST", url)
            )

        store = CloudConversations(self.local, cloud_client.conversation_request)
        with patch("httpx.post", side_effect=post):
            store.append(str(uuid.uuid4()), "user", "hello")
        self.assertEqual(requests[0]["requestId"], requests[1]["requestId"])
        with patch("httpx.post", side_effect=httpx.ReadTimeout("private diagnostic")):
            with self.assertRaisesRegex(ReadError, "Verifique a conexão"):
                store.quick_chat()


if __name__ == "__main__":
    unittest.main()


class ConversationRetryTests(unittest.TestCase):
    def test_explicit_operation_keeps_both_message_ids_stable(self):
        calls = []
        store = CloudConversations(None, lambda command: calls.append(command) or {})
        operation = str(uuid.uuid4())
        store.append_exchange(str(uuid.uuid4()), "Question", "Answer", request_id=operation)
        store.append_exchange(calls[0]["id"], "Question", "Answer", request_id=operation)
        self.assertEqual(calls[0]["requestId"], calls[1]["requestId"])
        self.assertEqual(calls[0]["assistantRequestId"], calls[1]["assistantRequestId"])
        self.assertNotEqual(calls[0]["requestId"], calls[0]["assistantRequestId"])
