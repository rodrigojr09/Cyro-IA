"""Test fixture only: real Writer API/SQLite, synthetic editorial provider, ephemeral data."""

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace as NS
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from project_store import ProjectStore
from writer_store import WriterStore, uid
from writer_models import Save
from writer_api import install

root = Path(sys.argv[1])
source = root / "source"
source.mkdir()
store = ProjectStore(root / "data")
project = store.register(source, "Livro de teste")
store.set_scope(project["id"], ["."], [])
writer = WriterStore(store, project["id"])
writer.configure({"cloud_consent": True, "auto_write": False})
document = writer.create("Uma noite fria.docx")
writer.save(
    Save(
        id=document["id"],
        base_version=1,
        request_id=uid(),
        blocks=[{"id": uid(), "type": "paragraph", "text": "Lucas abriu a porta."}],
    )
)


async def create(**kwargs):
    active = json.loads(kwargs["messages"][1]["content"])["context"]["active"]
    result = {
        "intent": "INSTRUCT",
        "confidence": 0.98,
        "substantive": True,
        "reason": "Provedor sintético do teste",
        "reply": "Destaquei a revisão em azul. Revise antes de aprovar.",
        "operation": "replace",
        "targetDocumentId": active["id"],
        "blockIds": [active["nearby_blocks"][0]["id"]],
        "blocks": [
            {
                "id": uid(),
                "type": "paragraph",
                "text": "Lucas abriu lentamente a antiga porta.",
            }
        ],
    }
    return NS(
        choices=[NS(finish_reason="stop", message=NS(content=json.dumps(result)))],
        usage=None,
    )


app = FastAPI()


@app.middleware("http")
async def authenticated(request: Request, call_next):
    if request.headers.get("X-Jarvis-Token") != os.environ["WRITER_TEST_TOKEN"]:
        return JSONResponse({"detail": "Não autorizado"}, status_code=401)
    return await call_next(request)


install(
    app,
    lambda: {
        "store": store,
        "cloud": True,
        "client": NS(chat=NS(completions=NS(create=create))),
        "model": "synthetic-test",
        "available": True,
    },
)
print(json.dumps({"project": project, "document": document["id"]}), flush=True)
uvicorn.run(
    app, host="127.0.0.1", port=int(sys.argv[2]), log_level="error", access_log=False
)
