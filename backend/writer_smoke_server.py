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
    packet = json.loads(kwargs["messages"][1]["content"])
    active = packet["context"]["active"]
    assert kwargs["tools"][0]["function"]["name"] == "writer_editorial"
    assert kwargs["tools"][0]["function"]["strict"] is True
    assert kwargs["tool_choice"]["function"]["name"] == "writer_editorial"
    assert kwargs["parallel_tool_calls"] is False
    generate = packet["message"] == "crie um texto sobre IA"
    feedback = packet["message"] == "muito resumido"
    result = {
        "intent": "INSTRUCT",
        "confidence": 0.98,
        "substantive": True,
        "reason": "Provedor sintético do teste",
        "reply": "Destaquei a revisão em azul. Revise antes de aprovar.",
        "operation": "append" if generate else "replace",
        "targetDocumentId": active["id"],
        "blockIds": [] if generate else [active["nearby_blocks"][0]["id"]],
        "blocks": [
            {
                "type": "paragraph",
                "text": (
                    "A inteligência artificial auxilia a análise de informações."
                    if generate
                    else (
                        active["nearby_blocks"][0]["text"]
                        + " Sistemas de IA podem reconhecer padrões e apoiar tarefas humanas. Seu uso exige supervisão, avaliação dos resultados e cuidado com informações pessoais."
                        if feedback
                        else "Lucas abriu lentamente a antiga porta."
                    )
                ),
            }
        ],
    }
    if packet["message"] == "Quem abriu a porta?":
        result.update(
            intent="CHAT", reply="Lucas abriu a porta.", blocks=[], blockIds=[]
        )
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
                                name="writer_editorial", arguments=json.dumps(result)
                            ),
                        )
                    ],
                ),
            )
        ],
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
