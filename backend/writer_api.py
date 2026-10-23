"""Dedicated local API. Existing local token middleware protects every route."""

import asyncio
import base64
from fastapi import HTTPException, Request
from pydantic import ValidationError
from programming.security import ReadError
from project_scope import ProjectSizeError
from writer_models import (
    Command,
    Create,
    Save,
    Decision,
    Restore,
    Structure,
    Export,
    Assist,
)
from writer_store import WriterStore, WriterConflict
from writer_export import WriterExportService
from writer_intelligence import assist


def install(app, environment):
    active = {}
    locks = {}

    def writer(project_id):
        env = environment()
        store = env["store"]
        if store is None:
            raise ReadError("Serviço local ainda não está pronto.")
        return WriterStore(getattr(store, "local", store), project_id)

    @app.post("/writer")
    async def command(request: Request):
        raw = await request.body()
        if len(raw) > 1024 * 1024:
            raise HTTPException(413, "Conteúdo acima de 1 MB por operação.")
        try:
            req = Command.model_validate_json(raw)
            w = writer(req.project_id)
            p = req.payload
            if req.action == "open":
                return w.open()
            if req.action == "get":
                return w.get(p["id"], p.get("include_removed") is True)
            if req.action == "proposal":
                return w.proposal(p["id"])
            if req.action == "revision":
                return w.revision(p["id"], p["revision_id"])
            if req.action == "create":
                value = Create.model_validate(p)
                return await asyncio.to_thread(
                    w.create, value.title, value.kind, value.parentId
                )
            if req.action == "save":
                return await asyncio.to_thread(w.save, Save.model_validate(p))
            if req.action == "settings":
                return w.configure(p)
            if req.action == "history":
                return w.history(p["id"])
            if req.action == "restore":
                v = Restore.model_validate(p)
                return w.restore(v.id, v.base_version, v.revision_id)
            if req.action in {"undo", "redo"}:
                return w.undo(p["id"], p["base_version"], req.action == "redo")
            if req.action == "structure":
                v = Structure.model_validate(p)
                if v.plan.targetDocumentId != v.id:
                    raise ReadError("Destino inconsistente.")
                return w.propose(
                    v.plan.model_dump(), "Organização manual", "MANUAL", v.base_version
                )
            if req.action == "decide":
                return await asyncio.to_thread(w.decide, Decision.model_validate(p))
            if req.action == "messages":
                result = w.messages(p.get("id"))
                for item in result:
                    if item["proposal"]:
                        proposal = w.proposal(item["proposal"])
                        item["proposal_state"] = {
                            k: proposal[k]
                            for k in ["id", "state", "node", "base", "auto"]
                        }
                return result
            if req.action == "prune":
                return w.prune(p.get("confirmed"))
            if req.action == "assist":
                value = Assist.model_validate(p)
                lock = locks.setdefault(w.project_id, asyncio.Lock())
                if lock.locked():
                    raise HTTPException(
                        409, "Uma resposta Writer já está em andamento neste projeto."
                    )
                async with lock:
                    env = environment()
                    # Writer AI is strictly Cloud, even if a legacy local mode is launched.
                    if not env["cloud"]:
                        raise ReadError(
                            "Use o login Cloud para a IA do Writer. A escrita manual permanece disponível."
                        )
                    task = asyncio.create_task(
                        assist(w, p, env["client"], env["model"], env["available"])
                    )
                    active[w.project_id] = task
                    try:
                        return await task
                    except asyncio.CancelledError:
                        raise HTTPException(
                            409, "Solicitação cancelada; nenhum texto foi aplicado."
                        )
                    finally:
                        active.pop(w.project_id, None)
        except ProjectSizeError as error:
            raise HTTPException(413, str(error))
        except WriterConflict as error:
            raise HTTPException(409, str(error))
        except ReadError as error:
            raise HTTPException(400, str(error))
        except (ValidationError, KeyError, TypeError, ValueError):
            raise HTTPException(400, "Operação Writer inválida.")

    @app.post("/writer/cancel")
    async def cancel(request: Request):
        try:
            if len(await request.body()) > 4096:
                raise HTTPException(413, "Solicitação acima do limite.")
            data = await request.json()
            w = writer(data["project_id"])
            task = active.get(w.project_id)
            if task:
                task.cancel()
            return {"cancelled": bool(task)}
        except (ReadError, KeyError, ValueError):
            raise HTTPException(400, "Projeto inválido.")

    @app.post("/writer/export")
    async def export(request: Request):
        if len(await request.body()) > 20000:
            raise HTTPException(413, "Seleção acima do limite.")
        try:
            req = Export.model_validate(await request.json())
            w = writer(req.project_id)
            content, name = await asyncio.to_thread(
                WriterExportService.export, w, req.document_ids, req.format
            )
            if len(content) > 15 * 1024 * 1024:
                raise ReadError(
                    "Exportação acima de 15 MB. Exporte capítulos separadamente."
                )
            return {
                "name": name,
                "base64": base64.b64encode(content).decode(),
                "format": req.format,
            }
        except ReadError as error:
            raise HTTPException(400, str(error))
        except (ValidationError, KeyError, ValueError):
            raise HTTPException(400, "Exportação inválida.")
