import asyncio
import base64
import io
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch
import uuid
import zipfile

from PIL import Image
from attachments import (
    AttachmentStore,
    AttachmentLimitError,
    MAX_BYTES,
    IMAGE_BYTES,
    document_text,
    image_bytes,
)
from programming.security import ReadError
from project_store import database
import protected_storage
import main
import test_jarvis
from cloud_conversations import CloudConversations


def make_image(path):
    image = Image.new("RGB", (2048, 1024), "green")
    image.save(path, "PNG")
    return path


class AttachmentStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.store = AttachmentStore(self.base / "data", [self.base / "Backup"])
        self.chat = str(uuid.uuid4())

    def tearDown(self):
        self.temp.cleanup()

    def test_five_files_and_exact_five_mb_are_accepted_but_overages_fail_atomically(
        self,
    ):
        files = []
        for index in range(5):
            path = self.base / f"note-{index}.txt"
            path.write_text("read me", encoding="utf-8")
            files.append(str(path))
        self.assertEqual(len(self.store.import_files(files, "a")), 5)
        with self.assertRaises(AttachmentLimitError):
            self.store.import_files([*files, files[0]], "a")
        large = self.base / "large.txt"
        large.write_bytes(b"a" * MAX_BYTES)
        exact = self.store.import_files([str(large)], "a")[0]
        self.assertEqual(exact["size"], MAX_BYTES)
        self.assertEqual(exact["partial"], 1)
        with large.open("ab") as stream:
            stream.write(b"x")
        before = list(self.store.root.iterdir())
        with self.assertRaises(AttachmentLimitError):
            self.store.import_files([files[0], str(large)], "a")
        self.assertEqual(before, list(self.store.root.iterdir()))

    def test_original_is_preserved_and_image_for_provider_is_bounded_jpeg_without_cloud_upload(
        self,
    ):
        path = make_image(self.base / "picture.png")
        original = path.read_bytes()
        file = self.store.import_files([str(path)], "a")[0]
        self.assertTrue(file["preview"].startswith("data:image/jpeg;base64,"))
        part = self.store.prepare([file["id"]], "a", self.chat)[1]
        optimized = base64.b64decode(part["image_url"]["url"].split(",")[1])
        self.assertLessEqual(len(optimized), IMAGE_BYTES)
        with Image.open(io.BytesIO(optimized)) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertLessEqual(max(image.size), 1536)
        self.assertEqual(self.store.content(file["id"], "a")[1], original)
        self.store.bind([file["id"]], "a", self.chat, 7)
        self.assertEqual(
            AttachmentStore(self.base / "data").recent(self.chat, "a"), [file["id"]]
        )
        self.assertEqual(
            self.store.history(
                self.chat, [{"id": 7, "role": "user", "content": "photo"}], "a"
            )[0]["attachments"][0]["name"],
            "picture.png",
        )
        destination = self.base / "saved.png"
        self.store.export(file["id"], "a", str(destination))
        self.assertEqual(destination.read_bytes(), original)

    def test_account_conversation_and_source_boundaries_are_enforced(self):
        path = self.base / "note.txt"
        path.write_text("local only", encoding="utf-8")
        file = self.store.import_files([str(path)], "a")[0]
        with self.assertRaises(ReadError):
            self.store.content(file["id"], "b")
        with self.assertRaises(ReadError):
            self.store.prepare(["../file"], "a", self.chat)
        with self.assertRaises(AttachmentLimitError):
            self.store.prepare([file["id"]] * 6, "a", self.chat)
        self.store.bind([file["id"]], "a", self.chat, 1)
        with self.assertRaises(ReadError):
            self.store.prepare([file["id"]], "a", str(uuid.uuid4()))
        self.store.discard([file["id"]], "a")
        self.assertTrue(self.store.path(file["id"]).exists())
        folder = self.base / "Backup"
        folder.mkdir()
        source = folder / "note.txt"
        source.write_text("archive")
        with self.assertRaises(ReadError):
            self.store.import_files([str(source)], "a")
        hard = self.base / "linked.txt"
        try:
            hard.hardlink_to(path)
            with self.assertRaises(ReadError):
                self.store.import_files([str(hard)], "a")
        finally:
            hard.unlink(missing_ok=True)

    def test_documents_extract_locally_and_reject_binary_xml_entities_and_zip_bombs(
        self,
    ):
        for extension, name, xml, expected in [
            (
                ".docx",
                "word/document.xml",
                '<w:document xmlns:w="w"><w:t>Study plan</w:t></w:document>',
                "Study plan",
            ),
            (
                ".pptx",
                "ppt/slides/slide1.xml",
                '<a:p xmlns:a="a"><a:t>Research project</a:t></a:p>',
                "Research project",
            ),
            (
                ".xlsx",
                "xl/worksheets/sheet1.xml",
                '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Budget</t></is></c></row></sheetData></worksheet>',
                "Budget",
            ),
        ]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, "w") as archive:
                archive.writestr(name, xml)
            self.assertIn(expected, document_text(stream.getvalue(), extension)[0])
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", b"x" * (26 * 1024 * 1024))
        with self.assertRaises(ReadError):
            document_text(stream.getvalue(), ".docx")
        with self.assertRaises(ReadError):
            document_text(b"\x00binary", ".txt")
        with self.assertRaises(ReadError):
            image_bytes(b"fake image")

    def test_configured_vault_encrypts_original_and_drafts_can_be_discarded(self):
        root = self.base / "encrypted"
        with protected_storage.session(root, b"a" * 32):
            store = AttachmentStore(root)
            source = self.base / "note.txt"
            source.write_text("PRIVATE_LOCAL_ATTACHMENT", encoding="utf-8")
            file = store.import_files([str(source)], "a")[0]
            self.assertTrue(
                store.path(file["id"]).read_bytes().startswith(protected_storage.MAGIC)
            )
            self.assertNotIn(
                b"PRIVATE_LOCAL_ATTACHMENT", store.path(file["id"]).read_bytes()
            )
            self.assertEqual(store.content(file["id"], "a")[1], source.read_bytes())
            store.discard([file["id"]], "a")
            self.assertFalse(store.path(file["id"]).exists())

    def test_real_pdf_extracts_text_locally(self):
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

        writer = PdfWriter()
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {NameObject("/F1"): writer._add_object(font)}
                )
            }
        )
        content = DecodedStreamObject()
        content.set_data(b"BT /F1 12 Tf 10 200 Td (Local PDF attachment) Tj ET")
        page[NameObject("/Contents")] = writer._add_object(content)
        stream = io.BytesIO()
        writer.write(stream)
        self.assertIn(
            "Local PDF attachment", document_text(stream.getvalue(), ".pdf")[0]
        )


class AttachmentApiTests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)

    def tearDown(self):
        test_jarvis.JarvisTests.tearDown(self)

    def test_backend_blocks_limits_and_unauthenticated_import_before_model(self):
        path = Path(self.temp.name) / "large.txt"
        path.write_bytes(b"a" * (MAX_BYTES + 1))
        response = self.client.post(
            "/desktop/attachments/import", json={"paths": [str(path)]}
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(
            self.client.post(
                "/desktop/attachments/import",
                headers={"X-Jarvis-Token": ""},
                json={"paths": []},
            ).status_code,
            401,
        )
        result = self.client.post(
            "/chat",
            json={
                "message": "hello",
                "attachments": [str(uuid.uuid4()) for _ in range(6)],
            },
        )
        self.assertEqual(result.status_code, 413)

    def test_cloud_conversation_stores_only_messages_with_attachment_data_kept_local(
        self,
    ):
        path = Path(self.temp.name) / "source-private.txt"
        path.write_text("LOCAL_EXTRACTED_CONTENT", encoding="utf-8")
        image = make_image(Path(self.temp.name) / "photo.png")
        chat_id, quick_id = str(uuid.uuid4()), str(uuid.uuid4())
        calls, history = [], []

        def request(command):
            if command["action"] == "storage":
                return {"blocked": False}
            calls.append(command.copy())
            if command["action"] == "fixed":
                return {"id": quick_id}
            if command["action"] == "get":
                return {"id": chat_id, "project_id": None, "archived": 0, "summary": ""}
            if command["action"] == "history":
                return history.copy()
            if command["action"] == "append":
                row = {
                    "id": len(history) + 1,
                    "role": command["role"],
                    "content": command["content"],
                    "attachment_count": command.get("attachmentCount", 0),
                }
                history.append(row)
                return {"ok": True, "id": row["id"]}
            self.fail("Unexpected Cloud storage operation")

        create = AsyncMock(return_value=test_jarvis.completion("Analysis completed."))
        with patch.object(main, "CLOUD", True), patch.object(
            main, "attachment_owner", "account-a"
        ), patch.object(main, "configured_key", return_value="session"), patch.object(
            main, "store", CloudConversations(main.store, request)
        ), patch.object(
            main.client.chat.completions, "create", create
        ):
            imported = self.client.post(
                "/desktop/attachments/import", json={"paths": [str(path), str(image)]}
            )
            self.assertEqual(imported.status_code, 200, imported.text)
            ids = [file["id"] for file in imported.json()["files"]]
            reply = self.client.post(
                "/chat",
                json={
                    "chat_id": chat_id,
                    "message": "Analyze these",
                    "attachments": ids,
                },
            )
            self.assertEqual(reply.status_code, 200, reply.text)
            sent = json.dumps(create.call_args.kwargs["messages"])
            self.assertIn("LOCAL_EXTRACTED_CONTENT", sent)
            self.assertIn("data:image/jpeg;base64,", sent)
            self.assertNotIn("LOCAL_EXTRACTED_CONTENT", str(calls))
            self.assertNotIn("source-private.txt", str(calls))
            self.assertNotIn("data:image", str(calls))
            restored = self.client.get("/chats/history", params={"chat_id": chat_id})
            self.assertEqual(len(restored.json()["messages"][0]["attachments"]), 2)
            other_machine = AttachmentStore(Path(self.temp.name) / "other-machine")
            with patch.object(main, "attachment_store", other_machine):
                remote = self.client.get(
                    "/chats/history", params={"chat_id": chat_id}
                ).json()
                self.assertEqual(
                    remote["messages"][0]["attachment_notice"],
                    "Salvo localmente em outro Computador",
                )
                self.assertTrue(remote["messages"][0]["attachments_unavailable"])
                self.assertNotIn("attachments", remote["messages"][0])
                answer = self.client.post(
                    "/chat", json={"chat_id": chat_id, "message": "Releia os anexos"}
                )
                self.assertEqual(answer.status_code, 200)
                self.assertNotIn(
                    "LOCAL_EXTRACTED_CONTENT",
                    json.dumps(create.call_args.kwargs["messages"]),
                )
            followup = self.client.post(
                "/chat", json={"chat_id": chat_id, "message": "Continue"}
            )
            self.assertEqual(followup.status_code, 200, followup.text)
            self.assertIn(
                "LOCAL_EXTRACTED_CONTENT",
                json.dumps(create.call_args.kwargs["messages"]),
            )
            with patch.object(main, "attachment_owner", "account-b"):
                self.assertEqual(
                    self.client.post(
                        "/desktop/attachments/info", json={"id": ids[0]}
                    ).status_code,
                    400,
                )

    def test_project_attachment_keeps_account_identity_with_project_context(self):
        folder = Path(self.temp.name) / "project"
        folder.mkdir()
        (folder / "plan.md").write_text("Research plan", encoding="utf-8")
        project = main.store.register(folder)
        main.store.set_scope(project["id"], ["."], [])
        main.store.update_project(project["id"], ready=1)
        chat = main.store.create_chat(project["id"])
        source = Path(self.temp.name) / "note.txt"
        source.write_text("Attached project evidence", encoding="utf-8")
        file = self.client.post(
            "/desktop/attachments/import", json={"paths": [str(source)]}
        ).json()["files"][0]
        with patch.object(
            main.client.chat.completions,
            "create",
            AsyncMock(return_value=test_jarvis.completion("Reviewed.")),
        ):
            reply = self.client.post(
                "/chat",
                json={
                    "chat_id": chat["id"],
                    "message": "Review",
                    "attachments": [file["id"]],
                },
            )
        self.assertEqual(reply.status_code, 200, reply.text)
        history = self.client.get(
            "/chats/history", params={"chat_id": chat["id"]}
        ).json()["messages"]
        self.assertEqual(history[0]["attachments"][0]["name"], "note.txt")


if __name__ == "__main__":
    unittest.main()
