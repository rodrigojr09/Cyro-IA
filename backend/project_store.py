"""Catálogo, bancos isolados, migração idempotente e documentos internos."""

import json
import os
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from programming.context import memory_summary
from programming.security import ReadError, ReadPolicy, redact
from project_scope import (
    SourceSelection,
    SelectedReadPolicy,
    browse_sources,
    selection_size,
    MAX_PROJECT_BYTES,
)
from portable_paths import source_reference, resolve_source
import protected_storage


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def database(path):
    path = Path(path)
    if protected_storage.enabled(path):
        with protected_storage.database(path) as con:
            yield con
        return
    if (
        path.parent.resolve() != path.parent.absolute()
        or path.is_symlink()
        or (path.exists() and path.stat().st_nlink > 1)
    ):
        raise ReadError("Caminho interno de banco redirecionado ou compartilhado.")
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=FULL")
    try:
        with con:
            yield con
    finally:
        con.close()


def identifier(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ReadError("Identificador inválido.") from None


def atomic_text(path, content):
    if protected_storage.enabled(path):
        protected_storage.write_text(path, content)
        return
    temporary = path.with_name(path.name + ".tmp")
    if (
        path.parent.resolve() != path.parent.absolute()
        or temporary.is_symlink()
        or (temporary.exists() and temporary.stat().st_nlink > 1)
    ):
        raise ReadError("Destino interno de documento redirecionado.")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


class ProjectStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.registry = self.root / "registry.db"
        (self.root / "projects").mkdir(exist_ok=True)
        (self.root / "general").mkdir(exist_ok=True)
        with database(self.registry) as con:
            if con.execute("PRAGMA user_version").fetchone()[0] > 3:
                raise ReadError(
                    "Formato de catálogo mais recente que esta versão do JARVIS."
                )
            con.executescript("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
                    path_key TEXT NOT NULL UNIQUE, file_identity TEXT,
                    created_at TEXT NOT NULL, last_analysis TEXT, updated_at TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'queued', knowledge_version INTEGER NOT NULL DEFAULT 0,
                    ready INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0,
                    progress TEXT NOT NULL DEFAULT 'Na fila', error TEXT,
                    tokens INTEGER NOT NULL DEFAULT 0, memory_deleted INTEGER NOT NULL DEFAULT 0,
                    coverage_complete INTEGER NOT NULL DEFAULT 0, scope_confirmed INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL,
                    created_at TEXT NOT NULL, last_message_at TEXT, archived INTEGER NOT NULL DEFAULT 0,
                    summary TEXT NOT NULL DEFAULT '', FOREIGN KEY(project_id) REFERENCES projects(id));
                CREATE TABLE IF NOT EXISTS migrations (source TEXT NOT NULL, legacy_id INTEGER NOT NULL,
                    PRIMARY KEY(source, legacy_id));
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            con.execute(
                "UPDATE projects SET state='interrupted', progress='Análise interrompida; retome a atualização', error='Interrupção durante a análise' WHERE state IN ('indexing','queued')"
            )
            if "coverage_complete" not in {
                row["name"] for row in con.execute("PRAGMA table_info(projects)")
            }:
                con.execute(
                    "ALTER TABLE projects ADD COLUMN coverage_complete INTEGER NOT NULL DEFAULT 0"
                )
            if "scope_confirmed" not in {
                row["name"] for row in con.execute("PRAGMA table_info(projects)")
            }:
                con.execute(
                    "ALTER TABLE projects ADD COLUMN scope_confirmed INTEGER NOT NULL DEFAULT 0"
                )
                con.execute(
                    "UPDATE projects SET state='selecting',progress='Confirme os arquivos do projeto antes de usar a API'"
                )
            con.execute("PRAGMA user_version=3")
            for table in ("projects", "chats"):
                if "instructions" not in {
                    row["name"] for row in con.execute(f"PRAGMA table_info({table})")
                }:
                    con.execute(
                        f"ALTER TABLE {table} ADD COLUMN instructions TEXT NOT NULL DEFAULT ''"
                    )
        with database(self.registry) as con:
            if "writer_document_id" not in {
                r["name"] for r in con.execute("PRAGMA table_info(chats)")
            }:
                con.execute("ALTER TABLE chats ADD COLUMN writer_document_id TEXT")
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS chat_writer_document ON chats(project_id,writer_document_id) WHERE writer_document_id IS NOT NULL"
            )
        self.initialize_db(self.root / "general" / "project.db")
        for project in self.projects(include_removed=True):
            if self.db_path(project["id"]).is_file():
                self.initialize_db(self.db_path(project["id"]))
                with database(self.registry) as con:
                    migration_key = "writer_chat_migration:" + project["id"]
                    migrated = con.execute(
                        "SELECT 1 FROM settings WHERE key=?", (migration_key,)
                    ).fetchone()
                if not migrated:
                    with database(self.db_path(project["id"])) as con:
                        exists = con.execute(
                            "SELECT 1 FROM sqlite_master WHERE name='writer_nodes'"
                        ).fetchone()
                        documents = (
                            [
                                dict(r)
                                for r in con.execute(
                                    "SELECT id,title,updated FROM writer_nodes WHERE deleted=0 AND kind!='folder'"
                                )
                            ]
                            if exists
                            else []
                        )
                    for document in documents:
                        with database(self.registry) as con:
                            con.execute(
                                "INSERT OR IGNORE INTO chats(id,project_id,title,created_at,writer_document_id) VALUES(?,?,?,?,?)",
                                (
                                    str(uuid.uuid4()),
                                    project["id"],
                                    document["title"],
                                    document["updated"],
                                    document["id"],
                                ),
                            )
                            migrated_chat = dict(
                                con.execute(
                                    "SELECT * FROM chats WHERE project_id=? AND writer_document_id=?",
                                    (project["id"], document["id"]),
                                ).fetchone()
                            )
                        self.mirror_chat(migrated_chat)
                    with database(self.registry) as con:
                        con.execute(
                            "INSERT INTO settings(key,value) VALUES(?,?)",
                            (migration_key, "1"),
                        )
        with database(self.registry) as con:
            row = con.execute(
                "SELECT value FROM settings WHERE key='general_chat'"
            ).fetchone()
        if row is None:
            chat = self.create_chat(None, "Conversa geral")
            with database(self.registry) as con:
                con.execute(
                    "INSERT INTO settings(key,value) VALUES('general_chat',?)",
                    (chat["id"],),
                )

    def initialize_db(self, path):
        with database(path) as con:
            if con.execute("PRAGMA user_version").fetchone()[0] > 2:
                raise ReadError(
                    "Formato de memória mais recente que esta versão do JARVIS."
                )
            con.executescript("""
                CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id,id);
                CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL,
                    created_at TEXT NOT NULL,last_message_at TEXT,archived INTEGER NOT NULL,summary TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS contexts (chat_id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS source_selection (id INTEGER PRIMARY KEY CHECK(id=1),include_paths TEXT NOT NULL,
                    exclude_paths TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, hash TEXT NOT NULL,
                    size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL, summary TEXT NOT NULL,
                    ai_summary TEXT NOT NULL DEFAULT '', analyzed_hash TEXT NOT NULL DEFAULT '',
                    module TEXT NOT NULL DEFAULT '', imports TEXT NOT NULL DEFAULT '[]', stale INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS knowledge (name TEXT PRIMARY KEY, content TEXT NOT NULL,
                    version INTEGER NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS knowledge_history (version INTEGER NOT NULL,
                    name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY(version,name));
                CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, kind TEXT NOT NULL,
                    content TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, created_at TEXT,
                    operation TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER);
            """)
            con.execute("PRAGMA user_version=2")
            if "scope_revision" not in {
                row["name"] for row in con.execute("PRAGMA table_info(messages)")
            }:
                con.execute(
                    "ALTER TABLE messages ADD COLUMN scope_revision TEXT NOT NULL DEFAULT ''"
                )
            if "stale" not in {
                row["name"] for row in con.execute("PRAGMA table_info(files)")
            }:
                con.execute(
                    "ALTER TABLE files ADD COLUMN stale INTEGER NOT NULL DEFAULT 0"
                )

    def project_dir(self, project_id):
        target = self.root / "projects" / identifier(project_id)
        if (
            target.parent.resolve() != target.parent
            or target.is_symlink()
            or (target.exists() and target.resolve() != target)
        ):
            raise ReadError("Diretório interno de memória inválido.")
        return target

    def db_path(self, project_id=None):
        return (
            self.project_dir(project_id) / "project.db"
            if project_id
            else self.root / "general" / "project.db"
        )

    def quick_chat(self, create=True):
        with database(self.registry) as con:
            row = con.execute(
                "SELECT value FROM settings WHERE key='quick_chat'"
            ).fetchone()
            existing = (
                con.execute(
                    "SELECT * FROM chats WHERE id=?", (row["value"],)
                ).fetchone()
                if row
                else None
            )
        if existing:
            if existing["archived"] and create:
                self.change_chat(existing["id"], archived=False)
            return existing["id"]
        if not create:
            return None
        chat = self.create_chat(None, "JARVIS Quick Chat")
        with database(self.registry) as con:
            con.execute(
                "INSERT OR REPLACE INTO settings VALUES('quick_chat',?)", (chat["id"],)
            )
        return chat["id"]

    def general_chat(self):
        with database(self.registry) as con:
            return con.execute(
                "SELECT value FROM settings WHERE key='general_chat'"
            ).fetchone()["value"]

    def project(self, project_id, include_removed=False):
        with database(self.registry) as con:
            row = con.execute(
                "SELECT * FROM projects WHERE id=?", (identifier(project_id),)
            ).fetchone()
        if row is None or (row["removed"] and not include_removed):
            raise ReadError("Projeto não cadastrado ou removido.")
        return self.resolve_project(row)

    def resolve_project(self, row):
        result = dict(row)
        result["path"] = resolve_source(result["path"], self.root)
        return result

    def projects(self, include_removed=False):
        with database(self.registry) as con:
            return [
                self.resolve_project(row)
                for row in con.execute(
                    "SELECT * FROM projects WHERE removed=0 OR ? ORDER BY name,path",
                    (include_removed,),
                )
            ]

    def register(self, path, name=""):
        policy = ReadPolicy()
        original = policy.authorize(path)
        # Nunca permita que a base interna seja analisada como código de um projeto.
        if original.is_relative_to(self.root) or self.root.is_relative_to(original):
            raise ReadError(
                "Selecione um projeto que não contenha a base interna do JARVIS."
            )
        try:
            with os.scandir(original) as entries:
                next(entries, None)
            info = original.stat()
        except OSError:
            raise ReadError("Projeto inacessível ou sem permissão.") from None
        stored = (
            source_reference(original, self.root)
            if os.getenv("JARVIS_PORTABLE") == "1"
            else str(original)
        )
        key = os.path.normcase(stored).rstrip("\\/")
        file_id = f"{info.st_dev}:{info.st_ino}" if info.st_ino else None
        with database(self.registry) as con:
            row = con.execute(
                "SELECT * FROM projects WHERE path_key=? OR (file_identity=? AND file_identity IS NOT NULL)",
                (key, file_id),
            ).fetchone()
            if row:
                project_id = row["id"]
                con.execute(
                    "UPDATE projects SET removed=0,path=?,path_key=?,file_identity=?,updated_at=? WHERE id=?",
                    (stored, key, file_id, now(), project_id),
                )
                created = bool(row["memory_deleted"])
                if created:
                    con.execute(
                        "UPDATE projects SET knowledge_version=0,ready=0,state='selecting',scope_confirmed=0,memory_deleted=0,tokens=0,last_analysis=NULL,coverage_complete=0 WHERE id=?",
                        (project_id,),
                    )
            else:
                project_id, created = str(uuid.uuid4()), True
                stamp = now()
                con.execute(
                    "INSERT INTO projects(id,name,path,path_key,file_identity,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                    (
                        project_id,
                        redact(name.strip() or original.name)[:120],
                        stored,
                        key,
                        file_id,
                        stamp,
                        stamp,
                    ),
                )
                con.execute(
                    "UPDATE projects SET state='selecting',progress='Escolha os arquivos antes de iniciar a análise' WHERE id=?",
                    (project_id,),
                )
        directory = self.project_dir(project_id)
        directory.mkdir(exist_ok=True)
        (directory / "arquivos").mkdir(exist_ok=True)
        self.initialize_db(directory / "project.db")
        return {**self.project(project_id), "created": created}

    def scope(self, project_id):
        project = self.project(project_id)
        with database(self.db_path(project_id)) as con:
            row = con.execute("SELECT * FROM source_selection WHERE id=1").fetchone()
        return {
            "include": json.loads(row["include_paths"]) if row else [],
            "exclude": json.loads(row["exclude_paths"]) if row else [],
            "revision": row["revision"] if row else "",
            "confirmed": bool(project["scope_confirmed"]),
        }

    def read_policy(self, project_id):
        project = self.project(project_id)
        scope = self.scope(project_id)
        if not scope["confirmed"]:
            raise ReadError(
                "Confirme Arquivos do projeto antes de iniciar leituras ou usar a API."
            )
        return SelectedReadPolicy(
            project["path"], SourceSelection(scope["include"], scope["exclude"])
        )

    def selection_preview(self, project_id, path=".", offset=0):
        project = self.project(project_id)
        return {
            **browse_sources(project["path"], path, offset),
            "selection": self.scope(project_id),
            "max_bytes": MAX_PROJECT_BYTES,
        }

    def set_scope(self, project_id, include, exclude):
        project = self.project(project_id)
        selection = SourceSelection(include, exclude)
        validator = ReadPolicy([project["path"]])
        for rule in selection.include:
            validator.resolve(rule, project["path"])
        total_bytes = selection_size(project["path"], selection)
        old = self.scope(project_id)
        if old["confirmed"] and old["revision"] == selection.revision:
            return {**self.project(project_id), "selection_changed": False}
        with database(self.db_path(project_id)) as con:
            con.execute(
                "INSERT OR REPLACE INTO source_selection VALUES(1,?,?,?,?)",
                (
                    json.dumps(selection.include),
                    json.dumps(selection.exclude),
                    selection.revision,
                    now(),
                ),
            )
            from programming.security import IGNORED, generated, sensitive

            for row in con.execute("SELECT path FROM files").fetchall():
                if not selection.selected(row["path"]) or any(
                    part.casefold() in IGNORED or generated(part) or sensitive(part)
                    for part in Path(row["path"]).parts
                ):
                    con.execute("DELETE FROM files WHERE path=?", (row["path"],))
            con.execute("DELETE FROM contexts")
            docs = con.execute("SELECT name FROM knowledge").fetchall()
            for doc in docs:
                con.execute(
                    "UPDATE knowledge SET content=? WHERE name=?",
                    (
                        "# Seleção alterada\n\nMemória aguardando atualização somente com os arquivos confirmados. Versões antigas permanecem no histórico interno.",
                        doc["name"],
                    ),
                )
            con.execute("UPDATE conversations SET summary=''")
        with database(self.registry) as con:
            con.execute("UPDATE chats SET summary='' WHERE project_id=?", (project_id,))
            con.execute(
                "UPDATE projects SET scope_confirmed=1,ready=0,coverage_complete=0,state='selecting',progress='Seleção salva; aguardando análise',updated_at=? WHERE id=?",
                (now(), project_id),
            )
        self.export_knowledge(project_id)
        return {
            **self.project(project_id),
            "selection_changed": True,
            "selected_bytes": total_bytes,
            "max_bytes": MAX_PROJECT_BYTES,
        }

    def validate_project_size(self, project_id):
        project = self.project(project_id)
        scope = self.scope(project_id)
        return selection_size(
            project["path"], SourceSelection(scope["include"], scope["exclude"])
        )

    def update_project(self, project_id, **values):
        allowed = {
            "state",
            "progress",
            "knowledge_version",
            "ready",
            "last_analysis",
            "updated_at",
            "error",
            "tokens",
            "coverage_complete",
            "name",
            "instructions",
        }
        if not values or not set(values) <= allowed:
            raise ReadError("Metadados inválidos.")
        with database(self.registry) as con:
            con.execute(
                "UPDATE projects SET "
                + ",".join(key + "=?" for key in values)
                + " WHERE id=?",
                (*values.values(), identifier(project_id)),
            )

    def chat(self, chat_id, allow_archived=False):
        with database(self.registry) as con:
            row = con.execute(
                "SELECT * FROM chats WHERE id=?", (identifier(chat_id),)
            ).fetchone()
        if row is None or (row["archived"] and not allow_archived):
            raise ReadError("Conversa inexistente ou arquivada.")
        result = dict(row)
        if result["project_id"]:
            self.project(result["project_id"])
        return result

    def chats(self, project_id=None, archived=False):
        if project_id:
            self.project(project_id)
        with database(self.registry) as con:
            return [
                dict(row)
                for row in con.execute(
                    "SELECT * FROM chats WHERE project_id IS ? AND archived=? ORDER BY COALESCE(last_message_at,created_at) DESC",
                    (project_id, archived),
                )
            ]

    def create_chat(self, project_id=None, title="Nova conversa"):
        if project_id:
            project = self.project(project_id)
            if not project["ready"] or not project["scope_confirmed"]:
                raise ReadError(
                    "Aguarde a análise inicial ou aceite explicitamente a análise parcial."
                )
        chat_id = str(uuid.uuid4())
        with database(self.registry) as con:
            con.execute(
                "INSERT INTO chats(id,project_id,title,created_at) VALUES(?,?,?,?)",
                (
                    chat_id,
                    project_id,
                    redact(title.strip() or "Nova conversa")[:120],
                    now(),
                ),
            )
        result = self.chat(chat_id)
        self.mirror_chat(result)
        return result

    def mirror_chat(self, chat):
        with database(self.db_path(chat["project_id"])) as con:
            con.execute(
                "INSERT OR REPLACE INTO conversations VALUES(?,?,?,?,?,?)",
                tuple(
                    chat[key]
                    for key in (
                        "id",
                        "title",
                        "created_at",
                        "last_message_at",
                        "archived",
                        "summary",
                    )
                ),
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
        chat = self.chat(chat_id, allow_archived=True)
        if delete or clear:
            if delete and chat_id == self.general_chat():
                raise ReadError(
                    "A conversa geral migrada é preservada; arquive-a se desejar."
                )
            with database(self.db_path(chat["project_id"])) as con:
                con.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))
                if chat.get("writer_document_id"):
                    con.execute(
                        "DELETE FROM writer_messages WHERE node=?",
                        (chat["writer_document_id"],),
                    )
                    con.execute(
                        "UPDATE writer_proposals SET state='REJECTED' WHERE node=? AND state='PENDING'",
                        (chat["writer_document_id"],),
                    )
                con.execute("DELETE FROM contexts WHERE chat_id=?", (chat_id,))
                if delete:
                    con.execute("DELETE FROM conversations WHERE id=?", (chat_id,))
            with database(self.registry) as con:
                if delete:
                    con.execute("DELETE FROM chats WHERE id=?", (chat_id,))
                else:
                    con.execute(
                        "UPDATE chats SET summary='',last_message_at=NULL WHERE id=?",
                        (chat_id,),
                    )
            if delete:
                return {"deleted": True}
        with database(self.registry) as con:
            if instructions is not None:
                con.execute(
                    "UPDATE chats SET instructions=? WHERE id=?",
                    (redact(instructions)[:4000], chat_id),
                )
            if title is not None:
                con.execute(
                    "UPDATE chats SET title=? WHERE id=?",
                    (redact(title.strip())[:120] or "Conversa", chat_id),
                )
            if archived is not None:
                con.execute(
                    "UPDATE chats SET archived=? WHERE id=?", (archived, chat_id)
                )
        result = self.chat(chat_id, allow_archived=True)
        self.mirror_chat(result)
        return result

    def history(
        self, chat_id, limit=100, before=None, for_model=False, context_scope=None
    ):
        chat = self.chat(chat_id, allow_archived=True)
        revision = (
            context_scope
            if context_scope is not None
            else (
                self.scope(chat["project_id"])["revision"]
                if chat["project_id"] and for_model
                else None
            )
        )
        with database(self.db_path(chat["project_id"])) as con:
            rows = con.execute(
                "SELECT id,role,content,created_at FROM messages WHERE chat_id=? AND id<?"
                + (" AND scope_revision=?" if revision is not None else "")
                + " ORDER BY id DESC LIMIT ?",
                (
                    chat_id,
                    before or 9223372036854775807,
                    *((revision,) if revision is not None else ()),
                    min(limit, 100),
                ),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def append(self, chat_id, role, content, context_scope=None, attachment_count=0):
        chat = self.chat(chat_id)
        with database(self.db_path(chat["project_id"])) as con:
            revision = (
                context_scope
                if context_scope is not None
                else (
                    self.scope(chat["project_id"])["revision"]
                    if chat["project_id"]
                    else ""
                )
            )
            inserted = con.execute(
                "INSERT INTO messages(chat_id,role,content,created_at,scope_revision) VALUES(?,?,?,?,?)",
                (chat_id, role, redact(content), now(), revision),
            )
        summary = (chat["summary"] + "\n" + role + ": " + memory_summary(content, 500))[
            -3000:
        ]
        with database(self.registry) as con:
            con.execute(
                "UPDATE chats SET last_message_at=?,summary=? WHERE id=?",
                (now(), summary, chat_id),
            )
        self.mirror_chat(self.chat(chat_id))
        return inserted.lastrowid

    def context(self, chat_id):
        chat = self.chat(chat_id)
        with database(self.db_path(chat["project_id"])) as con:
            row = con.execute(
                "SELECT data FROM contexts WHERE chat_id=?", (chat_id,)
            ).fetchone()
        return json.loads(row["data"]) if row else None

    def save_context(self, chat_id, data):
        chat = self.chat(chat_id)
        with database(self.db_path(chat["project_id"])) as con:
            con.execute(
                "INSERT OR REPLACE INTO contexts VALUES(?,?)",
                (chat_id, json.dumps(data, ensure_ascii=False)),
            )

    def knowledge(self, project_id, name="IDEIA.md"):
        self.project(project_id)
        allowed = {
            "IDEIA.md",
            "ARCHITECTURE.md",
            "DECISIONS.md",
            "FEATURES.md",
            "PROBLEMS.md",
        }
        if name not in allowed:
            raise ReadError("Documento de conhecimento não permitido.")
        with database(self.db_path(project_id)) as con:
            row = con.execute(
                "SELECT content FROM knowledge WHERE name=?", (name,)
            ).fetchone()
        return row["content"] if row else ""

    def knowledge_context(self, project_id):
        # Reserva espaço para decisões e problemas, mesmo em um IDEIA.md grande.
        import re

        text = self.knowledge(project_id)
        sections = re.split(r"(?m)(?=^## )", text)
        return "\n".join(
            section[: 1600 if section.startswith("## Objetivo") else 650]
            for section in sections
        )[:10000]

    def export_knowledge(self, project_id):
        directory = self.project_dir(project_id)
        with database(self.db_path(project_id)) as con:
            docs = con.execute("SELECT name,content FROM knowledge").fetchall()
            files = [
                dict(row)
                for row in con.execute(
                    "SELECT path,hash,size,mtime_ns,module,stale FROM files ORDER BY path"
                )
            ]
        for item in files:
            item["type"] = Path(item["path"]).suffix or "text"
            item["modified_at"] = datetime.fromtimestamp(
                item["mtime_ns"] / 1_000_000_000, timezone.utc
            ).isoformat()
            item["historical_not_reconfirmed"] = bool(item.pop("stale"))
        for row in docs:
            if row["name"] not in {
                "IDEIA.md",
                "ARCHITECTURE.md",
                "DECISIONS.md",
                "FEATURES.md",
                "PROBLEMS.md",
            }:
                continue
            destination = (
                directory / row["name"]
                if row["name"] == "IDEIA.md"
                else directory / "arquivos" / row["name"]
            )
            atomic_text(destination, row["content"])
        atomic_text(
            directory / "arquivos" / "FILE_INDEX.json",
            json.dumps(files, ensure_ascii=False, indent=2),
        )

    def note(self, project_id, kind, content):
        self.project(project_id)
        if kind not in {"decision", "idea", "problem", "information"}:
            raise ReadError("Tipo de anotação inválido.")
        with database(self.db_path(project_id)) as con:
            con.execute(
                "INSERT INTO notes VALUES(?,?,?,?)",
                (str(uuid.uuid4()), kind, redact(content)[:4000], now()),
            )

    def remove_project(self, project_id, delete_memory=False):
        project = self.project(project_id)
        directory = self.project_dir(project_id)
        if delete_memory:
            # Verifica o destino absoluto antes de qualquer remoção recursiva.
            parent = (self.root / "projects").resolve()
            resolved = directory.resolve()
            if (
                resolved.parent != parent
                or resolved == parent
                or resolved == Path(project["path"]).resolve()
            ):
                raise ReadError("Destino de exclusão interna inválido.")
            if directory.exists():
                shutil.rmtree(directory)
        with database(self.registry) as con:
            if delete_memory:
                con.execute("DELETE FROM chats WHERE project_id=?", (project_id,))
            con.execute(
                "UPDATE projects SET removed=1,memory_deleted=?,state='removed' WHERE id=?",
                (delete_memory, project_id),
            )
        return {
            "removed": True,
            "memory_deleted": delete_memory,
            "original_untouched": True,
        }

    def migrate(self, legacy_db, legacy_directory):
        if Path(legacy_db).is_file():
            source = str(Path(legacy_db).resolve())
            old = sqlite3.connect(
                Path(legacy_db).resolve().as_uri() + "?mode=ro", uri=True
            )
            try:
                rows = old.execute(
                    "SELECT id,role,content FROM messages ORDER BY id"
                ).fetchall()
            finally:
                old.close()
            # ATTACH permite inserir mensagens e marcadores na mesma transação.
            with database(self.registry) as con:
                con.execute("ATTACH DATABASE ? AS general", (str(self.db_path()),))
                for legacy_id, role, content in rows:
                    if con.execute(
                        "SELECT 1 FROM migrations WHERE source=? AND legacy_id=?",
                        (source, legacy_id),
                    ).fetchone():
                        continue
                    con.execute(
                        "INSERT INTO general.messages(chat_id,role,content,created_at) VALUES(?,?,?,?)",
                        (self.general_chat(), role, content, now()),
                    )
                    con.execute(
                        "INSERT INTO migrations VALUES(?,?)", (source, legacy_id)
                    )
        # Autorizações antigas são preservadas, sem analisar ou registrar pastas automaticamente.
        old_roots = Path(legacy_directory) / ".programming-roots.json"
        new_roots = self.root / ".programming-roots.json"
        if old_roots.is_file() and not new_roots.exists():
            try:
                values = json.loads(old_roots.read_text(encoding="utf-8"))
                if isinstance(values, list) and all(
                    isinstance(value, str) for value in values
                ):
                    atomic_text(new_roots, json.dumps(values[:10]))
            except (OSError, ValueError):
                pass
        old_context = Path(legacy_directory) / ".programming-context.json"
        backup = self.root / "legacy-programming-context.json"
        if old_context.is_file() and not backup.exists():
            try:
                data = json.loads(old_context.read_text(encoding="utf-8"))
                atomic_text(backup, json.dumps(data, ensure_ascii=False))
            except (OSError, ValueError):
                pass
