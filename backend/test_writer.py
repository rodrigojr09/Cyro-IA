import asyncio
import io
import json
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from project_store import ProjectStore, database, identifier
from programming.security import ReadError
from writer_models import Save, Decision, Block, Assist
from writer_store import WriterStore, WriterConflict, uid
from writer_intelligence import (
    assist,
    WriterIntentClassifier,
    WriterEditorialService,
    editorial_response,
    EDITORIAL_FUNCTION,
)
from writer_export import WriterExportService


def block(text, kind="paragraph"):
    return {"id": uid(), "type": kind, "text": text}


def response(document, message, intent="WRITE", operation="append", **values):
    return {
        "intent": intent,
        "confidence": 0.99,
        "targetDocumentId": document["id"] if document else None,
        "operation": operation,
        "blocks": [block(message)] if intent == "WRITE" else [],
        "blockIds": [],
        "destinationDocumentId": None,
        "parentId": None,
        "title": "",
        "kind": "document",
        "position": 0,
        "substantive": False,
        "reason": "Classificação de teste",
        "reply": "Resposta editorial",
        **values,
    }


def client(packet):
    async def create(**kwargs):
        value = packet(kwargs) if callable(packet) else packet
        return NS(
            choices=[NS(finish_reason="stop", message=NS(content=json.dumps(value)))],
            usage=None,
        )

    return NS(chat=NS(completions=NS(create=AsyncMock(side_effect=create))))


class WriterTests(unittest.IsolatedAsyncioTestCase):
    async def test_generated_article_uses_structured_data_and_requires_approval(self):
        text = "A inteligência artificial auxilia pessoas na análise de informações."
        packet = response(
            self.doc,
            "",
            "INSTRUCT",
            "append",
            blocks=[{"type": "paragraph", "text": text}],
            substantive=True,
        )

        async def provider(**kwargs):
            self.assertEqual(kwargs["tools"][0]["function"]["name"], EDITORIAL_FUNCTION)
            self.assertIn("crie um texto sobre IA", kwargs["messages"][1]["content"])
            return NS(
                choices=[
                    NS(
                        finish_reason="tool_calls",
                        message=NS(
                            content=None,
                            tool_calls=[
                                NS(
                                    type="function",
                                    function=NS(
                                        name=EDITORIAL_FUNCTION,
                                        arguments=json.dumps(packet),
                                    ),
                                )
                            ],
                        ),
                    )
                ],
                usage=None,
            )

        result = await assist(
            self.writer,
            {
                "request_id": uid(),
                "message": "crie um texto sobre IA",
                "document_id": self.doc["id"],
                "base_version": 1,
            },
            NS(chat=NS(completions=NS(create=provider))),
            "test",
            True,
        )
        self.assertFalse(result["proposal"]["auto"])
        identifier(result["proposal"]["plan"]["blocks"][0]["id"])
        self.assertEqual(self.writer.get(self.doc["id"])["blocks"], [])
        self.writer.decide(Decision(id=result["proposal"]["id"], approve=True))
        self.assertEqual(self.writer.get(self.doc["id"])["blocks"][0]["text"], text)

    def test_editorial_presentation_and_new_ids_do_not_relax_reference_validation(self):
        packet = response(
            self.doc,
            "Texto preparado.",
            blocks=[
                {"id": "paragraph-1", "type": "paragraph", "text": "Texto preparado."}
            ],
        )
        for content in [json.dumps(packet), "```json\n" + json.dumps(packet) + "\n```"]:
            result = editorial_response(NS(content=content))
            identifier(result.blocks[0].id)
            self.assertNotEqual(result.blocks[0].id, "paragraph-1")
        for content in [
            "Proposta: " + json.dumps(packet),
            json.dumps({**packet, "path": "../Backup"}),
            "```json\n{}\n```",
        ]:
            with self.assertRaises(ValueError):
                editorial_response(NS(content=content))
        for calls in [
            [
                NS(
                    type="function",
                    function=NS(name="execute", arguments=json.dumps(packet)),
                )
            ],
            [
                NS(
                    type="function",
                    function=NS(name=EDITORIAL_FUNCTION, arguments=json.dumps(packet)),
                )
            ]
            * 2,
        ]:
            with self.assertRaises(ValueError):
                editorial_response(NS(content=None, tool_calls=calls))
        packet["operation"] = "replace"
        packet["blockIds"] = ["invented-reference"]
        result = editorial_response(NS(content=json.dumps(packet)))
        with self.assertRaises(ReadError):
            self.writer.propose(
                result.model_dump(
                    exclude={"intent", "confidence", "substantive", "reason", "reply"}
                ),
                "Teste",
                "INSTRUCT",
                1,
            )

    async def test_generation_with_linguistic_disabled_does_not_insert_request(self):
        self.writer.configure({"linguistic": False})
        generated = "A inteligência artificial é uma área da computação."
        result = await self.send(
            "crie um texto sobre IA", response(self.doc, generated)
        )
        self.assertFalse(result["proposal"]["auto"])
        self.assertEqual(result["proposal"]["plan"]["blocks"][0]["text"], generated)

    def test_restore_cannot_create_cycle_and_undo_cannot_orphan_new_children(self):
        a = self.writer.create("A", "folder")
        b = self.writer.create("B", "folder")

        def move(node, parent):
            current = self.writer.get(node["id"])
            proposal = self.writer.propose(
                {
                    "operation": "move",
                    "targetDocumentId": node["id"],
                    "parentId": parent,
                },
                "Mover",
                "MANUAL",
                current["version"],
            )
            self.writer.decide(Decision(id=proposal["id"], approve=True))

        move(a, b["id"])
        old = self.writer.history(a["id"])[0]["id"]
        move(a, None)
        move(b, a["id"])
        with self.assertRaises(WriterConflict):
            self.writer.restore(a["id"], 3, old)
        self.assertIsNone(self.writer.get(a["id"])["parent"])

    async def test_cancellation_during_cloud_response_preserves_manual_document(self):
        import httpx
        from fastapi import FastAPI
        from writer_api import install

        started = asyncio.Event()

        async def waiting(**_):
            started.set()
            await asyncio.Event().wait()

        app = FastAPI()
        provider = NS(chat=NS(completions=NS(create=waiting)))
        install(
            app,
            lambda: {
                "store": self.store,
                "cloud": True,
                "available": True,
                "client": provider,
                "model": "test",
            },
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://test"
        ) as api:
            task = asyncio.create_task(
                api.post(
                    "/writer",
                    json={
                        "project_id": self.project["id"],
                        "action": "assist",
                        "payload": {
                            "request_id": uid(),
                            "document_id": self.doc["id"],
                            "base_version": 1,
                            "message": "Era uma noite fria. Lucas caminhava sozinho.",
                        },
                    },
                )
            )
            await started.wait()
            result = await api.post(
                "/writer/cancel", json={"project_id": self.project["id"]}
            )
            self.assertTrue(result.json()["cancelled"])
            self.assertEqual((await task).status_code, 409)
            self.assertEqual(self.writer.get(self.doc["id"])["blocks"], [])
            self.save(self.doc, [block("Manual após cancelamento")])

    def test_multiple_undo_redo_follow_history_in_order(self):
        for text in ["Um", "Dois", "Três"]:
            current = self.writer.get(self.doc["id"])
            self.save(current, [block(text)])
        self.writer.undo(self.doc["id"], 4)
        self.writer.undo(self.doc["id"], 5)
        self.assertEqual(self.writer.get(self.doc["id"])["blocks"][0]["text"], "Um")
        self.writer.undo(self.doc["id"], 6, True)
        self.writer.undo(self.doc["id"], 7, True)
        self.assertEqual(self.writer.get(self.doc["id"])["blocks"][0]["text"], "Três")

    async def test_current_preferences_and_explicit_intent_override(self):
        result = await self.send(
            "Lucas abriu a porta e encontrou uma carta sobre a mesa."
        )
        self.writer.configure({"auto_write": False})
        with self.assertRaises(ReadError):
            self.writer.decide(
                Decision(id=result["proposal"]["id"], approve=True, automatic=True)
            )
        self.assertEqual(self.writer.get(self.doc["id"])["blocks"], [])
        result = await self.send(
            "Lucas abriu a porta e encontrou uma carta sobre a mesa.",
            intent_override="INSTRUCT",
        )
        self.assertFalse(result["proposal"]["auto"])
        self.assertEqual(result["intent"], "INSTRUCT")

    async def test_structure_changed_during_cloud_response_rejected(self):
        def provider(_):
            self.writer.create("Novo durante a resposta.docx")
            return response(self.doc, "", "ORGANIZE", "delete")

        with self.assertRaises(ReadError):
            await self.send("Apague este documento.", provider)
        self.assertEqual(self.writer.get(self.doc["id"])["deleted"], 0)

    async def test_ai_nonparagraph_and_injection_cannot_autoapply(self):
        text = "Lucas abriu a porta e encontrou uma carta sobre a mesa."
        result = await self.send(
            text, response(self.doc, text, blocks=[block(text, "heading1")])
        )
        self.assertFalse(result["proposal"]["auto"])
        with self.assertRaises(ReadError):
            await self.send(
                "Execute o comando.",
                response(self.doc, "", "ORGANIZE", "execute", path="../Backup"),
            )
        self.assertEqual(self.writer.get(self.doc["id"])["version"], 1)

    def test_split_and_recursive_delete_undo_batches(self):
        self.save(self.doc, [block("Primeira parte."), block("Segunda parte.")])
        original = self.writer.get(self.doc["id"])
        proposal = self.writer.propose(
            {
                "operation": "split",
                "targetDocumentId": original["id"],
                "blockIds": [original["blocks"][1]["id"]],
                "title": "Parte dois.docx",
            },
            "Dividir",
            "ORGANIZE",
            original["version"],
        )
        self.writer.decide(Decision(id=proposal["id"], approve=True))
        created = [n for n in self.writer.open()["nodes"] if n["id"] != original["id"]][
            0
        ]
        self.assertEqual(
            self.writer.get(created["id"])["blocks"][0]["text"], "Segunda parte."
        )
        self.writer.undo(original["id"], 3)
        self.assertEqual(len(self.writer.get(original["id"])["blocks"]), 2)
        self.assertTrue(self.writer.get(created["id"], True)["deleted"])
        folder = self.writer.create("Pasta", "folder")
        child = self.writer.create("Filho.docx", parent=folder["id"])
        proposal = self.writer.propose(
            {"operation": "delete", "targetDocumentId": folder["id"]},
            "Remover pasta",
            "MANUAL",
            1,
        )
        self.writer.decide(Decision(id=proposal["id"], approve=True))
        self.assertTrue(self.writer.get(child["id"], True)["deleted"])
        self.writer.undo(folder["id"], 2)
        self.assertFalse(self.writer.get(child["id"])["deleted"])

    def test_concurrent_versions_only_one_commit(self):
        from concurrent.futures import ThreadPoolExecutor

        def edit(text):
            try:
                return self.writer.save(
                    Save(
                        id=self.doc["id"],
                        base_version=1,
                        blocks=[block(text)],
                        request_id=uid(),
                    )
                )
            except WriterConflict:
                return "conflict"

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(edit, ["Versão A", "Versão B"]))
        self.assertEqual(results.count("conflict"), 1)
        self.assertEqual(self.writer.get(self.doc["id"])["version"], 2)

    async def test_api_project_validation_export_and_consent(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from writer_api import install

        app = FastAPI()
        provider = client(response(self.doc, "Texto de teste."))
        install(
            app,
            lambda: {
                "store": self.store,
                "cloud": True,
                "available": True,
                "client": provider,
                "model": "test",
            },
        )
        with TestClient(app) as api:

            def post(action, payload=None, project=None):
                return api.post(
                    "/writer",
                    json={
                        "project_id": project or self.project["id"],
                        "action": action,
                        "payload": payload or {},
                    },
                )

            self.assertEqual(post("open").status_code, 200)
            self.assertEqual(post("open", project="general").status_code, 400)
            self.assertEqual(
                post(
                    "save",
                    {
                        "id": self.doc["id"],
                        "base_version": 1,
                        "blocks": [],
                        "request_id": uid(),
                        "path": "../Backup",
                    },
                ).status_code,
                400,
            )
            self.writer.configure({"cloud_consent": False})
            result = post(
                "assist",
                {
                    "request_id": uid(),
                    "document_id": self.doc["id"],
                    "base_version": 1,
                    "message": "Era uma noite fria. Lucas caminhava sozinho.",
                },
            )
            self.assertEqual(result.status_code, 400)
            provider.chat.completions.create.assert_not_called()
            self.assertEqual(
                post(
                    "save",
                    {
                        "id": self.doc["id"],
                        "base_version": 1,
                        "blocks": [block("Texto manual")],
                        "request_id": uid(),
                    },
                ).status_code,
                200,
            )
            result = api.post(
                "/writer/export",
                json={
                    "project_id": self.project["id"],
                    "document_ids": [self.doc["id"]],
                    "format": "docx",
                },
            )
            self.assertEqual(result.status_code, 200)
            import base64

            self.assertTrue(base64.b64decode(result.json()["base64"]).startswith(b"PK"))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = ProjectStore(root / "data")
        source = root / "source"
        source.mkdir()
        (source / "story.txt").write_text("Livro local", encoding="utf-8")
        self.project = self.store.register(source, "Livro")
        self.store.set_scope(self.project["id"], ["."], [])
        self.writer = WriterStore(self.store, self.project["id"])
        self.writer.configure({"cloud_consent": True})
        self.doc = self.writer.create("Livro.docx")

    def tearDown(self):
        self.temp.cleanup()

    def save(self, doc, content):
        return self.writer.save(
            Save(
                id=doc["id"],
                base_version=doc["version"],
                blocks=content,
                request_id=uid(),
            )
        )

    async def send(self, text, packet=None, **kwargs):
        document = self.writer.get(self.doc["id"])
        request = {
            "request_id": uid(),
            "message": text,
            "document_id": document["id"],
            "base_version": document["version"],
            **kwargs,
        }
        return await assist(
            self.writer,
            request,
            client(packet or response(document, text)),
            "test",
            True,
        )

    def test_manual_persistence_versions_and_idempotency(self):
        req = Save(
            id=self.doc["id"],
            base_version=1,
            blocks=[Block(**block("Olá **mundo**."))],
            request_id=uid(),
        )
        first = self.writer.save(req)
        self.assertEqual(self.writer.save(req), first)
        reopened = WriterStore(ProjectStore(self.store.root), self.project["id"])
        self.assertEqual(
            reopened.get(self.doc["id"])["blocks"][0]["text"], "Olá **mundo**."
        )
        self.assertEqual(first["version"], 2)
        with self.assertRaises(WriterConflict):
            self.save(self.doc, [block("Não sobrescrever")])

    def test_path_scope_and_duplicate_blocks(self):
        with self.assertRaises(ReadError):
            self.writer.create("../fora.docx")
        with self.assertRaises(ReadError):
            WriterStore(self.store, "../Backup")
        source = Path(self.temp.name) / "other"
        source.mkdir()
        other = self.store.register(source, "Outro")
        isolated = WriterStore(self.store, other["id"])
        with self.assertRaises(ReadError):
            isolated.get(self.doc["id"])
        repeated = block("Mesmo id")
        with self.assertRaises(ReadError):
            self.save(self.doc, [repeated, repeated])

    async def test_three_unequivocal_paragraphs_and_retry_no_duplicates(self):
        for text in [
            "Era uma noite fria. Lucas caminhava sozinho pela cidade.",
            "Lucas abriu a porta e encontrou uma carta sobre a mesa.",
            "Marina esperou em silêncio até o relógio marcar nove horas.",
        ]:
            result = await self.send(text)
            self.assertTrue(result["proposal"]["auto"])
            self.assertEqual(
                len(self.writer.get(self.doc["id"])["blocks"]),
                len(self.writer.history(self.doc["id"])) - 1,
            )
            decision = Decision(
                id=result["proposal"]["id"], approve=True, automatic=True
            )
            self.writer.decide(decision)
            self.writer.decide(decision)
        self.assertEqual(len(self.writer.get(self.doc["id"])["blocks"]), 3)

    async def test_intents_and_instruct_never_auto(self):
        self.save(self.doc, [block("Lucas recebeu uma carta.")])
        doc = self.writer.get(self.doc["id"])
        result = await self.send(
            "Deixe o segundo parágrafo mais misterioso.",
            response(
                doc,
                "",
                "INSTRUCT",
                "replace",
                blockIds=[doc["blocks"][0]["id"]],
                blocks=[block("Lucas recebeu uma carta sem remetente.")],
                substantive=True,
            ),
        )
        self.assertFalse(result["proposal"]["auto"])
        self.assertEqual(self.writer.get(doc["id"])["version"], 2)
        self.writer.decide(Decision(id=result["proposal"]["id"], approve=False))
        self.assertEqual(
            self.writer.get(doc["id"])["blocks"][0]["text"], "Lucas recebeu uma carta."
        )
        result = await self.send(
            "O que você acha do capítulo?", response(doc, "", "CHAT")
        )
        self.assertIsNone(result["proposal"])
        self.assertEqual(self.writer.get(doc["id"])["version"], 2)

    async def test_organize_create_delete_confirm_and_recover(self):
        result = await self.send(
            "Crie uma seção chamada Introdução.",
            response(
                None, "", "ORGANIZE", "create", title="Introdução", kind="section"
            ),
        )
        applied = self.writer.decide(
            Decision(id=result["proposal"]["id"], approve=True)
        )
        new = self.writer.get(applied["id"])
        proposal = self.writer.propose(
            {"operation": "delete", "targetDocumentId": new["id"]},
            "Apague a seção",
            "ORGANIZE",
            new["version"],
        )
        with self.assertRaises(ReadError):
            self.writer.decide(
                Decision(id=proposal["id"], approve=True, automatic=True)
            )
        self.writer.decide(Decision(id=proposal["id"], approve=True))
        with self.assertRaises(ReadError):
            self.writer.get(new["id"])
        with database(self.writer.path) as con:
            deleted = self.writer.node(con, new["id"], True)
        self.writer.undo(new["id"], deleted["version"])
        self.assertEqual(self.writer.get(new["id"])["title"], "Introdução")

    async def test_conflicts_proposal_not_overwrite_manual(self):
        result = await self.send("Lucas abriu a porta e encontrou a carta.")
        self.save(self.doc, [block("Minha edição manual")])
        decision = self.writer.decide(
            Decision(id=result["proposal"]["id"], approve=True)
        )
        self.assertEqual(decision["state"], "CONFLICTED")
        self.assertEqual(
            self.writer.get(self.doc["id"])["blocks"][0]["text"], "Minha edição manual"
        )

    def test_undo_redo_restore_new_revision(self):
        self.save(self.doc, [block("Primeira versão")])
        second = self.writer.get(self.doc["id"])
        self.save(second, [block("Segunda versão")])
        undone = self.writer.undo(self.doc["id"], 3)
        self.assertEqual(undone["blocks"][0]["text"], "Primeira versão")
        redone = self.writer.undo(self.doc["id"], 4, True)
        self.assertEqual(redone["blocks"][0]["text"], "Segunda versão")
        old = next(r for r in self.writer.history(self.doc["id"]) if r["version"] == 2)
        restored = self.writer.restore(self.doc["id"], 5, old["id"])
        self.assertEqual(restored["version"], 6)
        self.assertEqual(restored["blocks"][0]["text"], "Primeira versão")

    def test_move_cycle_and_atomic_multi_document_undo(self):
        folder = self.writer.create("Pasta", "folder")
        child = self.writer.create("Outra", "folder", folder["id"])
        p = self.writer.propose(
            {
                "operation": "move",
                "targetDocumentId": folder["id"],
                "parentId": child["id"],
            },
            "Mover",
            "MANUAL",
            1,
        )
        with self.assertRaises(ReadError):
            self.writer.decide(Decision(id=p["id"], approve=True))
        self.assertIsNone(self.writer.get(folder["id"])["parent"])
        first = block("Mover este trecho")
        self.save(self.doc, [first, block("Manter aqui")])
        dest = self.writer.create("Destino.docx")
        p = self.writer.propose(
            {
                "operation": "move_blocks",
                "targetDocumentId": self.doc["id"],
                "destinationDocumentId": dest["id"],
                "blockIds": [first["id"]],
            },
            "Mover trecho",
            "ORGANIZE",
            2,
        )
        self.writer.decide(Decision(id=p["id"], approve=True))
        self.assertEqual(len(self.writer.get(dest["id"])["blocks"]), 1)
        self.writer.undo(dest["id"], 2)
        self.assertEqual(len(self.writer.get(dest["id"])["blocks"]), 0)
        self.assertEqual(len(self.writer.get(self.doc["id"])["blocks"]), 2)

    def test_small_changes_names_facts_and_ambiguity(self):
        self.assertTrue(
            WriterEditorialService.minor("Lucas abriu a porta.", "Lucas abriu a porta!")
        )
        for text in [
            "Marcos abriu a porta.",
            "Lucas não abriu a porta.",
            "Lucas abriu duas portas.",
        ]:
            self.assertFalse(WriterEditorialService.minor("Lucas abriu a porta.", text))
        self.assertFalse(
            WriterEditorialService.minor("Lucas tem 20 anos.", "Lucas tem 30 anos.")
        )
        self.assertFalse(WriterIntentClassifier.unequivocal_write("Melhore o texto."))
        self.assertFalse(WriterIntentClassifier.unequivocal_write("O que você acha?"))

    async def test_substantive_or_user_chat_override_never_autosaves(self):
        text = "Lucas abriu a porta e entrou na sala."
        result = await self.send(text, response(self.doc, text, substantive=True))
        self.assertFalse(result["proposal"]["auto"])
        result = await self.send(text, intent_override="CHAT")
        self.assertIsNone(result["proposal"])
        self.assertEqual(self.writer.get(self.doc["id"])["blocks"], [])

    async def test_network_invalid_schema_no_document_change_manual_still_works(self):
        before = self.writer.get(self.doc["id"])
        with self.assertRaises(ReadError):
            await self.send("Uma pergunta.", {"intent": "DELETE_DISK", "path": "C:/"})
        broken = NS(
            chat=NS(completions=NS(create=AsyncMock(side_effect=ConnectionError())))
        )
        with self.assertRaises(ReadError):
            await assist(
                self.writer,
                {
                    "request_id": uid(),
                    "message": "Teste",
                    "document_id": self.doc["id"],
                    "base_version": 1,
                },
                broken,
                "test",
                True,
            )
        self.assertEqual(self.writer.get(self.doc["id"]), before)
        self.save(self.doc, [block("Edição sem IA disponível")])
        self.assertEqual(self.writer.get(self.doc["id"])["version"], 2)

    def test_docx_real_formats_order_and_no_original_change(self):
        data = [
            block("Introdução", "heading1"),
            block("Ação **importante** e *cuidadosa* com café."),
            block("Primeiro item", "bullet"),
            block("Segundo item", "number"),
            block("", "pagebreak"),
            block("Conclusão", "heading2"),
        ]
        self.save(self.doc, data)
        other = self.writer.create("Capítulo dois.docx", "chapter")
        self.writer.save(
            Save(
                id=other["id"],
                base_version=1,
                blocks=[Block(**block("Última página."))],
                request_id=uid(),
            )
        )
        before = self.writer.get(self.doc["id"])
        content, name = WriterExportService.export(self.writer, [], "docx")
        from docx import Document

        document = Document(io.BytesIO(content))
        all_text = "\n".join(p.text for p in document.paragraphs)
        self.assertIn("Ação importante e cuidadosa com café.", all_text)
        self.assertLess(all_text.index("Introdução"), all_text.index("Última página."))
        self.assertTrue(any(run.bold for p in document.paragraphs for run in p.runs))
        self.assertTrue(any(run.italic for p in document.paragraphs for run in p.runs))
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            self.assertIn(b'w:type="page"', archive.read("word/document.xml"))
        self.assertEqual(self.writer.get(self.doc["id"]), before)
        self.assertTrue(name.endswith(".docx"))
        for format in ["md", "txt"]:
            self.assertIn(
                "café",
                WriterExportService.export(self.writer, [self.doc["id"]], format)[
                    0
                ].decode(),
            )

    def test_limit_and_retention_no_silent_loss(self):
        huge = [block("x" * 12000) for _ in range(50)]
        with self.assertRaises(ReadError):
            self.save(self.doc, huge)
        self.assertEqual(self.writer.get(self.doc["id"])["version"], 1)
        self.assertTrue(self.writer.prune(True)["important_preserved"])


class WriterAuthenticationTests(unittest.TestCase):
    def setUp(self):
        from test_jarvis import JarvisTests

        JarvisTests.setUp(self)

    def tearDown(self):
        from test_jarvis import JarvisTests

        JarvisTests.tearDown(self)

    def test_all_writer_routes_use_existing_local_token(self):
        for route in ["/writer", "/writer/export", "/writer/cancel"]:
            response = self.client.post(
                route, json={"project_id": uid()}, headers={"X-Jarvis-Token": ""}
            )
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("access-control-allow-origin", response.headers)


if __name__ == "__main__":
    unittest.main()
