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
        project_id = identifier(project_id)
        key = "project_quick:" + project_id
        with database(self.local.registry) as con:
            row = con.execute(
                "SELECT value FROM settings WHERE key=?", (key,)
            ).fetchone()
        if row:
            try:
                self.local.chat(row["value"])
                return row["value"]
            except ReadError:
                pass
        chat = self.local.create_chat(project_id, "JARVIS Quick Chat")
        with database(self.local.registry) as con:
            con.execute(
                "INSERT OR REPLACE INTO settings VALUES(?,?)", (key, chat["id"])
            )
        return chat["id"]

    def chat(self, chat_id, allow_archived=False):
        if self.local_chat(chat_id):
            return self.local.chat(chat_id, allow_archived)
        row = self.request({"action": "get", "id": identifier(chat_id)})
        if row["archived"] and not allow_archived:
            raise ReadError("Conversa arquivada.")
        return row

    def all_chats(self):
        with database(self.local.registry) as con:
            rows = [
                dict(row)
                for row in con.execute(
                    "SELECT * FROM chats WHERE project_id IS NOT NULL ORDER BY COALESCE(last_message_at,created_at) DESC"
                )
            ]
        return self.request({"action": "list"}) + rows

    def chats(self, project_id=None, archived=False):
        if project_id:
            return self.local.chats(project_id, archived)
        return [
            row
            for row in self.request({"action": "list"})
            if bool(row["archived"]) == archived
        ]

    def create_chat(self, project_id=None, title="Nova conversa"):
        if project_id:
            return self.local.create_chat(project_id, title)
        return self.request(
            {
                "action": "create",
                "title": redact(title.strip())[:120],
                "requestId": str(uuid.uuid4()),
            }
        )

    def change_chat(self, chat_id, title=None, archived=None, delete=False):
        if self.local_chat(chat_id):
            return self.local.change_chat(chat_id, title, archived, delete)
        command = {"action": "change", "id": identifier(chat_id), "delete": delete}
        if title is not None:
            command["title"] = redact(title.strip())[:120]
        if archived is not None:
            command["archived"] = bool(archived)
        return self.request(command)

    def history(
        self, chat_id, limit=100, before=None, for_model=False, context_scope=None
    ):
        if self.local_chat(chat_id):
            return self.local.history(chat_id, limit, before, for_model, context_scope)
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

    def append(self, chat_id, role, content, context_scope=None):
        if self.local_chat(chat_id):
            return self.local.append(chat_id, role, content, context_scope)
        self.request(
            {
                "action": "append",
                "id": identifier(chat_id),
                "requestId": str(uuid.uuid4()),
                "role": role,
                "content": redact(content),
                "scope": context_scope or "",
            }
        )

    def context(self, chat_id):
        # Device references/permissions must never travel in general chat memory.
        return self.local.context(chat_id) if self.local_chat(chat_id) else None

    def save_context(self, chat_id, data):
        if self.local_chat(chat_id):
            self.local.save_context(chat_id, data)
