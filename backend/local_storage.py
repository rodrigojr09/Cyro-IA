"""Storage accounting and explicit cleanup of app-owned conversation data."""

import os
import shutil
import protected_storage
from pathlib import Path
from programming.security import ReadError
from project_store import database

STORAGE_MESSAGE = "Limite de memória na nuvem atingido. Apague alguns chats para liberar memória e continuar usando o Cyro IA."


class StorageFullError(ReadError):
    def __init__(self):
        super().__init__(STORAGE_MESSAGE)


def status(store, attachments, owner):
    root = store.root.resolve()

    def size(path):
        if not path.exists():
            return 0
        if path.is_symlink() or path.resolve() != path.absolute():
            raise ReadError("Dados internos redirecionados; limpeza interrompida.")
        if path.is_file():
            return path.stat().st_size
        total = 0
        for current, dirs, files in os.walk(path, followlinks=False):
            dirs[:] = [
                d
                for d in dirs
                if not (Path(current) / d).is_symlink()
                and (Path(current) / d).resolve().is_relative_to(root)
            ]
            for name in files:
                item = Path(current) / name
                if not item.is_symlink() and item.resolve().is_relative_to(root):
                    total += item.stat().st_size
        return total

    project_bytes = (
        size(root / "projects") + size(root / "general") + size(store.registry)
    )
    with database(attachments.registry) as con:
        files = con.execute("SELECT id FROM files WHERE owner=?", (owner,)).fetchall()
    attachment_bytes = sum(size(attachments.path(row["id"])) for row in files)
    return {
        "usedBytes": project_bytes + attachment_bytes,
        "projectBytes": project_bytes,
        "attachmentBytes": attachment_bytes,
        "scope": "Dados dos projetos deste computador e anexos desta conta",
    }


def clear_local(store, attachments, owner):
    root = store.root.resolve()
    if any(root.is_relative_to(folder) for folder in attachments.forbidden):
        raise ReadError("O Backup do proprietário é somente leitura.")
    targets = [root / "projects", root / "general"]
    # Validate every absolute target before deleting anything, never source folders.
    for target in targets:
        if (
            target.is_symlink()
            or target.resolve().parent != root
            or target.resolve() == root
        ):
            raise ReadError("Destino de limpeza local inválido.")
    with database(attachments.registry) as con:
        files = con.execute("SELECT id FROM files WHERE owner=?", (owner,)).fetchall()
        con.execute("PRAGMA secure_delete=ON")
        con.execute("DELETE FROM bindings WHERE owner=?", (owner,))
        con.execute("DELETE FROM files WHERE owner=?", (owner,))
    for row in files:
        attachments.path(row["id"]).unlink(missing_ok=True)
    for target in targets:
        if target.exists():
            shutil.rmtree(target)
        target.mkdir()
    with database(store.registry) as con:
        con.execute("PRAGMA secure_delete=ON")
        con.execute("DELETE FROM chats")
        con.execute("DELETE FROM projects")
        con.execute(
            "DELETE FROM settings WHERE key='general_chat' OR key='quick_chat' OR key LIKE 'project_quick:%'"
        )
    if not protected_storage.enabled(store.registry):
        with database(store.registry) as con:
            con.execute("VACUUM")
    # Keep migration markers: deleted legacy history must not be imported again.
    store.initialize_db(root / "general" / "project.db")
    chat = store.create_chat(None, "Conversa geral")
    with database(store.registry) as con:
        con.execute(
            "INSERT OR REPLACE INTO settings VALUES('general_chat',?)", (chat["id"],)
        )
    return {"cleared": True, "original_untouched": True}
