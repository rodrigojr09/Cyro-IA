import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
import unittest
import main
import test_jarvis
from cloud_conversations import CloudConversations
from local_storage import clear_local, status
from project_store import database


class StorageSettingsTests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)

    def tearDown(self):
        test_jarvis.JarvisTests.tearDown(self)

    def project(self):
        folder = Path(self.temp.name) / "original"
        folder.mkdir()
        (folder / "plan.md").write_text("Original project", encoding="utf-8")
        project = main.store.register(folder)
        main.store.set_scope(project["id"], ["."], [])
        main.store.update_project(project["id"], ready=1, state="ready")
        return folder, project

    def test_project_and_chat_instructions_are_separate_and_both_reach_model(self):
        folder, project = self.project()
        self.assertEqual(
            self.client.post(
                "/projects/settings",
                json={
                    "project_id": project["id"],
                    "name": "Estudos",
                    "instructions": "PROJECT_PREFERENCE",
                },
            ).status_code,
            200,
        )
        chat = main.store.create_chat(project["id"], "Plano")
        result = self.client.post(
            "/chats/settings",
            json={
                "chat_id": chat["id"],
                "title": "Revisão",
                "instructions": "CHAT_EXTRA_PREFERENCE",
            },
        )
        self.assertEqual(result.status_code, 200, result.text)
        create = AsyncMock(return_value=test_jarvis.completion("Plano revisado."))
        with patch.object(main.client.chat.completions, "create", create):
            answer = self.client.post(
                "/chat", json={"chat_id": chat["id"], "message": "Ajude a estudar"}
            )
        self.assertEqual(answer.status_code, 200, answer.text)
        messages = json.dumps(create.call_args.kwargs["messages"])
        self.assertIn("PROJECT_PREFERENCE", messages)
        self.assertIn("CHAT_EXTRA_PREFERENCE", messages)
        self.assertEqual(
            main.store.project(project["id"])["instructions"], "PROJECT_PREFERENCE"
        )
        general = main.store.create_chat()
        self.client.post(
            "/chats/settings",
            json={
                "chat_id": general["id"],
                "title": "Geral",
                "instructions": "GENERAL_ONLY",
            },
        )
        with patch.object(main.client.chat.completions, "create", create):
            self.assertEqual(
                self.client.post(
                    "/chat", json={"chat_id": general["id"], "message": "Oi"}
                ).status_code,
                200,
            )
        self.assertNotIn(
            "PROJECT_PREFERENCE", json.dumps(create.call_args.kwargs["messages"])
        )
        self.assertIn("GENERAL_ONLY", json.dumps(create.call_args.kwargs["messages"]))
        self.assertEqual(
            (folder / "plan.md").read_text(encoding="utf-8"), "Original project"
        )
        self.assertEqual(
            self.client.post(
                "/chats/settings",
                json={
                    "chat_id": general["id"],
                    "title": "Geral",
                    "instructions": "x" * 4001,
                },
            ).status_code,
            422,
        )

    def test_full_cloud_blocks_chat_and_stream_before_model_but_cleanup_stays_available(
        self,
    ):
        commands = []

        def request(command):
            commands.append(command)
            return (
                {"blocked": True, "usedBytes": 52428800, "limitBytes": 52428800}
                if command["action"] == "storage"
                else {"cleared": True}
            )

        create = AsyncMock()
        with patch.object(main, "CLOUD", True), patch.object(
            main, "store", CloudConversations(main.store, request)
        ), patch.object(main, "configured_key", return_value="session"), patch.object(
            main.client.chat.completions, "create", create
        ):
            for route in ["/chat", "/chat/stream"]:
                reply = self.client.post(route, json={"message": "Não chamar o modelo"})
                self.assertEqual(reply.status_code, 507, reply.text)
                self.assertIn("Apague alguns chats", reply.text)
            create.assert_not_called()
            self.assertEqual(
                self.client.post(
                    "/desktop/storage/clear", json={"scope": "cloud"}
                ).status_code,
                400,
            )
            self.assertEqual(
                self.client.post(
                    "/desktop/storage/clear", json={"scope": "cloud", "confirmed": True}
                ).status_code,
                200,
            )
            self.assertEqual(commands[-1], {"action": "clear", "confirmed": True})

    def test_local_cleanup_preserves_originals_login_preferences_and_other_account_attachments(
        self,
    ):
        folder, project = self.project()
        chat = main.store.create_chat(project["id"])
        main.store.append(chat["id"], "user", "PRIVATE_PROJECT_HISTORY")
        source = Path(self.temp.name) / "note.txt"
        source.write_text("Local attachment")
        own = main.attachment_store.import_files([str(source)], "local")[0]
        other = main.attachment_store.import_files([str(source)], "other")[0]
        credentials = main.DATA / "cloud-session-v4.bin"
        credentials.write_bytes(b"protected-session")
        config = main.DATA / "config"
        config.mkdir(exist_ok=True)
        (config / "settings.json").write_text('{"voice":true}')
        before = status(main.store, main.attachment_store, "local")
        self.assertGreater(before["attachmentBytes"], 0)
        reply = self.client.post(
            "/desktop/storage/clear", json={"scope": "local", "confirmed": True}
        )
        self.assertEqual(reply.status_code, 200, reply.text)
        self.assertEqual(main.store.projects(), [])
        self.assertFalse(main.attachment_store.path(own["id"]).exists())
        self.assertTrue(main.attachment_store.path(other["id"]).exists())
        self.assertEqual(credentials.read_bytes(), b"protected-session")
        self.assertTrue((config / "settings.json").exists())
        self.assertEqual(
            (folder / "plan.md").read_text(encoding="utf-8"), "Original project"
        )
        self.assertTrue(main.store.general_chat())
        self.assertEqual(
            self.client.get("/storage", headers={"X-Jarvis-Token": ""}).status_code, 401
        )

    def test_clear_chat_keeps_name_and_instructions(self):
        chat = main.store.create_chat(title="Minha conversa")
        main.store.change_chat(chat["id"], instructions="Preferências")
        main.store.append(chat["id"], "user", "Apagar conteúdo")
        reply = self.client.post(
            "/chats/change",
            json={"chat_id": chat["id"], "clear": True, "confirmed": True},
        )
        self.assertEqual(reply.status_code, 200, reply.text)
        self.assertEqual(main.store.history(chat["id"]), [])
        self.assertEqual(main.store.chat(chat["id"])["instructions"], "Preferências")

    def test_local_usage_and_cleanup_remain_available_when_cloud_is_offline(self):
        from programming.security import ReadError

        def offline(command):
            raise ReadError("Nuvem temporariamente indisponível.")

        with patch.object(main, "CLOUD", True), patch.object(
            main, "attachment_owner", "account-a"
        ), patch.object(main, "store", CloudConversations(main.store, offline)):
            reply = self.client.get("/storage")
            self.assertEqual(reply.status_code, 200, reply.text)
            self.assertGreater(reply.json()["local"]["usedBytes"], 0)
            self.assertIsNone(reply.json()["cloud"])
            self.assertIn("indisponível", reply.json()["cloudError"])
            reply = self.client.post(
                "/desktop/storage/clear", json={"scope": "local", "confirmed": True}
            )
            self.assertEqual(reply.status_code, 200, reply.text)

    def test_local_cleanup_works_with_configured_encrypted_storage(self):
        import protected_storage
        from project_store import ProjectStore
        from attachments import AttachmentStore

        root = Path(self.temp.name) / "encrypted-cleanup"
        with protected_storage.session(root, b"b" * 32):
            local = ProjectStore(root)
            attachments = AttachmentStore(root)
            chat = local.create_chat(title="Temporary")
            local.append(chat["id"], "user", "PRIVATE_OLD_HISTORY")
            result = clear_local(local, attachments, "local")
            self.assertTrue(result["cleared"])
            self.assertFalse(
                any(item["title"] == "Temporary" for item in local.chats())
            )
            self.assertTrue(
                local.registry.read_bytes().startswith(protected_storage.MAGIC)
            )


if __name__ == "__main__":
    unittest.main()
