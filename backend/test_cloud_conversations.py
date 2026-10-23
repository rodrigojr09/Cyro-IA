import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

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

    def test_project_chats_and_quick_stay_local_without_cloud_requests(self):
        project = register_selected(
            self.local, make_project(Path(self.temp.name) / "source")
        )
        self.local.update_project(project["id"], ready=1, state="ready")
        chat = self.store.create_chat(project["id"], "Local")
        self.store.append(chat["id"], "user", "LOCAL_PROJECT_SECRET")
        self.assertEqual(
            self.store.history(chat["id"])[0]["content"], "LOCAL_PROJECT_SECRET"
        )
        quick = self.store.project_quick_chat(project["id"])
        self.assertEqual(self.store.project_quick_chat(project["id"]), quick)
        self.store.append(quick, "assistant", "LOCAL_QUICK_REPLY", "quick:project")
        self.assertEqual(self.store.history(quick)[0]["content"], "LOCAL_QUICK_REPLY")
        self.assertEqual(self.calls, [])

    def test_old_local_general_history_and_references_are_never_uploaded(self):
        self.local.append(self.local.general_chat(), "user", "LEGACY_PRIVATE_MESSAGE")
        general = self.store.general_chat()
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
                store.general_chat()


if __name__ == "__main__":
    unittest.main()
