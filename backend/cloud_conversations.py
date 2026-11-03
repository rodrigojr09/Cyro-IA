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
        return self.request({"action": "fixed", "slot": "general"})["id"]

    def quick_chat(self, create=True):
        # The server unique (owner, slot) guarantees one chat across all launches/devices.
        return self.request({"action": "fixed", "slot": "quick"})["id"]

    def project_quick_chat(self, project_id):
        raise ReadError("Abra um Espaço Virtual na janela principal.")

    def chat(self, chat_id, allow_archived=False):
        if self.local_chat(chat_id):
            raise ReadError("Conversa de projeto local preservada no legado; use um Espaço Virtual.")
        row = self.request({"action": "get", "id": identifier(chat_id)})
        if row["archived"] and not allow_archived:
            raise ReadError("Conversa arquivada.")
        return row

    def all_chats(self):
        return self.request({"action": "list"})

    def chats(self, project_id=None, archived=False):
        if project_id:
            raise ReadError("Projetos locais foram substituídos por Espaços Virtuais.")
        return [
            row
            for row in self.request({"action": "list"})
            if bool(row["archived"]) == archived
        ]

    def create_chat(self, project_id=None, title="Nova conversa"):
        if project_id:
            raise ReadError("Crie conversas no Espaço Virtual pela API central.")
        return self.request(
            {
                "action": "create",
                "title": redact(title.strip())[:120],
                "requestId": str(uuid.uuid4()),
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
        general_id = self.general_chat()
        chats, messages = [], {}
        after, until, catalog_after = 0, None, None
        while True:
            command = {"action": "bootstrap", "after": after}
            if until is not None:
                command["until"] = until
                command["catalogAfter"] = catalog_after
            page = self.request(command)
            chats.extend(page.get("chats") or [])
            for message in page["messages"]:
                messages.setdefault(message["chat_id"], []).append(message)
            until = page["until"]
            catalog_after = page.get("catalogNext")
            if page["next"] is None and catalog_after is None:
                break
            if page["next"] is not None and page["next"] <= after:
                raise ReadError("Falha ao carregar o histórico. Entre novamente.")
            after = page["next"] if page["next"] is not None else until
        return general_id, chats, messages


    def append_exchange(self, chat_id, user, assistant):
        return self.request(
            {
                "action": "exchange",
                "id": identifier(chat_id),
                "requestId": str(uuid.uuid4()),
                "assistantRequestId": str(uuid.uuid4()),
                "user": redact(user),
                "assistant": redact(assistant),
            }
        )

    def append(self, chat_id, role, content, context_scope=None, attachment_count=0):
        if self.local_chat(chat_id):
            raise ReadError("O legado local está preservado e não pode ser alterado por este fluxo.")
        return self.request(
            {
                "action": "append",
                "id": identifier(chat_id),
                "requestId": str(uuid.uuid4()),
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
