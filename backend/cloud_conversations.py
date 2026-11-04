"""Cloud general chats; project files, permissions and histories remain local.

No legacy local general history is uploaded implicitly. The authenticated Cloud
selects the owner on every request, so switching accounts cannot reuse history.
"""

import uuid

from programming.security import ReadError, redact
from project_store import database, identifier


class CloudConversations:
    def __init__(self, local, request):
        self.local = local
        self.request = request

    def __getattr__(self, name):
        return getattr(self.local, name)

    def local_chat(self, chat_id):
        with database(self.local.registry) as con:
            row = con.execute(
                "SELECT project_id FROM chats WHERE id=?", (identifier(chat_id),)
            ).fetchone()
        return bool(row and row["project_id"])

    def general_chat(self):
        raise ReadError("Use Novo chat ou escolha uma conversa. A Conversa Geral fixa foi removida.")

    def quick_chat(self, create=True):
        # The server unique (owner, slot) guarantees one chat across all launches/devices.
        return self.request({"action": "fixed", "slot": "quick", "metadataOnly": True})["id"]

    def project_quick_chat(self, project_id):
        raise ReadError("Abra um Espaço Virtual na janela principal.")

    def chat(self, chat_id, allow_archived=False):
        if self.local_chat(chat_id):
            raise ReadError("Conversa de projeto local preservada no legado; use um Espaço Virtual.")
        row = self.request({"action": "get", "id": identifier(chat_id)})
        if row["archived"] and not allow_archived:
            raise ReadError("Conversa arquivada.")
        return row

    def catalog(self, search="", offset=0):
        return self.request({"action": "catalog", "search": search[:200], "offset": offset, "limit": 30, "archived": False})

    def all_chats(self):
        return self.catalog()["chats"]

    def chats(self, project_id=None, archived=False):
        if project_id:
            raise ReadError("Projetos locais foram substituídos por Espaços Virtuais.")
        return [
            row
            for row in self.request({"action": "list"})
            if bool(row["archived"]) == archived
        ]

    def create_chat(self, project_id=None, title="Nova conversa", request_id=None):
        if project_id:
            raise ReadError("Crie conversas no Espaço Virtual pela API central.")
        return self.request(
            {
                "action": "create",
                "title": redact(title.strip())[:120],
                "requestId": request_id or str(uuid.uuid4()),
                "autoTitle": title == "Nova conversa",
            }
        )

    def change_chat(
        self,
        chat_id,
        title=None,
        archived=None,
        delete=False,
        instructions=None,
        clear=False,
    ):
        if self.local_chat(chat_id):
            raise ReadError("O legado local está preservado e não pode ser alterado por este fluxo.")
        command = {"action": "change", "id": identifier(chat_id), "delete": delete}
        if title is not None:
            command["title"] = redact(title.strip())[:120]
        if archived is not None:
            command["archived"] = bool(archived)
        if instructions is not None:
            command["instructions"] = redact(instructions)[:4000]
        if clear:
            command["clear"] = True
        return self.request(command)

    def history(
        self, chat_id, limit=100, before=None, for_model=False, context_scope=None
    ):
        if self.local_chat(chat_id):
            raise ReadError("O histórico local está preservado no legado.")
        command = {
            "action": "history",
            "id": identifier(chat_id),
            "limit": min(max(limit, 1), 100),
        }
        if before is not None:
            command["before"] = before
        if context_scope is not None:
            command["scope"] = context_scope
        return self.request(command)

    def bootstrap(self):
        quick = self.request({"action": "fixed", "slot": "quick", "metadataOnly": True})
        page = self.catalog()
        self.catalog_next = page.get("next")
        return None, [quick, *page["chats"]], {}

    @staticmethod
    def assistant_request(operation):
        return str(uuid.uuid5(uuid.UUID(operation), "assistant"))

    def exchange_receipt(self, chat_id, operation):
        return self.request({"action": "receipt", "id": identifier(chat_id), "requestId": operation, "assistantRequestId": self.assistant_request(operation)})

    def append_exchange(self, chat_id, user, assistant, request_id=None, context_scope=None, user_already_stored=False):
        request_id = request_id or str(uuid.uuid4())
        return self.request(
            {
                "action": "exchange",
                "id": identifier(chat_id),
                "requestId": request_id,
                "assistantRequestId": self.assistant_request(request_id),
                "user": redact(user),
                "assistant": redact(assistant),
                **({"userAlreadyStored": True, "scope": context_scope or ""} if user_already_stored else {}),
            }
        )

    def append(self, chat_id, role, content, context_scope=None, attachment_count=0, request_id=None):
        if self.local_chat(chat_id):
            raise ReadError("O legado local está preservado e não pode ser alterado por este fluxo.")
        return self.request(
            {
                "action": "append",
                "id": identifier(chat_id),
                "requestId": request_id or str(uuid.uuid4()),
                "role": role,
                "content": redact(content),
                "scope": context_scope or "",
                "attachmentCount": attachment_count,
            }
        ).get("id")

    def context(self, chat_id):
        # Device references/permissions must never travel in general chat memory.
        return None

    def save_context(self, chat_id, data):
        if self.local_chat(chat_id):
            raise ReadError("O legado local está preservado e não pode ser alterado por este fluxo.")
