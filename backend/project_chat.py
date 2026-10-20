"""Contexto por conversa; permissões fixas ao projeto proprietário."""

import json
from pathlib import Path

from pydantic import Field

from programming.context import ProgrammingContext
from programming.security import ReadError, ReadPolicy
from programming.tools import Arguments, ProgrammingService, TOOLS


class KnowledgeArgs(Arguments):
    name: str = Field(default="IDEIA.md", max_length=80)


KNOWLEDGE_TOOL = {
    "type": "function",
    "function": {
        "name": "read_knowledge",
        "description": "Consulta um documento interno do projeto deste chat: IDEIA.md, ARCHITECTURE.md, DECISIONS.md, FEATURES.md ou PROBLEMS.md.",
        "parameters": KnowledgeArgs.model_json_schema(),
    },
}


class StoredContext(ProgrammingContext):
    def __init__(self, store, chat_id):
        self.store, self.chat_id = store, chat_id
        self.data = store.context(chat_id) or {
            "project": None,
            "last_file": None,
            "references": [],
            "problem": "",
            "suggestions": "",
        }

    def save(self):
        self.store.save_context(self.chat_id, self.data)


class ProjectChatService(ProgrammingService):
    def __init__(self, store, chat):
        self.store, self.chat_info = store, chat
        self.project_info = (
            store.project(chat["project_id"]) if chat["project_id"] else None
        )
        self.fixed_path = self.project_info["path"] if self.project_info else None
        self.context = StoredContext(store, chat["id"])
        self.policy = (
            store.read_policy(chat["project_id"]) if self.fixed_path else ReadPolicy([])
        )
        self.progress = "Pronto"
        if self.fixed_path:
            self.context.select(self.fixed_path)
        self.tools = TOOLS + [KNOWLEDGE_TOOL] if self.fixed_path else []

    def choose(self, reference):
        if not self.fixed_path:
            raise ReadError("Cadastre e abra um projeto para ler arquivos.")
        if reference and reference not in {
            self.project_info["name"],
            self.fixed_path,
            ".",
        }:
            try:
                if self.policy.resolve(reference, self.fixed_path) != Path(
                    self.fixed_path
                ):
                    raise ReadError(
                        "O projeto desta conversa é fixo. Abra outro projeto pela interface."
                    )
            except ReadError:
                raise ReadError(
                    "O projeto desta conversa é fixo. Abra outro projeto pela interface."
                ) from None
        return Path(self.fixed_path), None

    def dispatch(self, name, arguments):
        if name == "read_knowledge":
            request = KnowledgeArgs.model_validate_json(arguments)
            return {
                "document": request.name,
                "content": self.store.knowledge(
                    self.chat_info["project_id"], request.name
                )[:14000],
                "knowledge_version": self.store.project(self.chat_info["project_id"])[
                    "knowledge_version"
                ],
                "state": self.store.project(self.chat_info["project_id"])["state"],
                "untrusted_content": True,
            }
        if name in {"select_project", "analyze_project"}:
            from programming.tools import ProjectArgs

            request = ProjectArgs.model_validate_json(arguments)
            self.choose(request.project)
            return {
                "project": self.project_info,
                "knowledge": self.store.knowledge(self.chat_info["project_id"])[:10000],
                "note": "Memória existente reutilizada; nenhuma análise completa foi iniciada.",
            }
        if name == "list_projects":
            from programming.tools import ListArgs

            ListArgs.model_validate_json(arguments)
            return (
                {
                    "projects": [
                        {
                            "id": self.project_info["id"],
                            "name": self.project_info["name"],
                            "path": self.fixed_path,
                        }
                    ]
                }
                if self.fixed_path
                else {"projects": []}
            )
        return super().dispatch(name, arguments)
