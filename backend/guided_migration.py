"""Explicit offline migration. Originals are never deleted; staged copies are encrypted."""

import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import uuid
from contextlib import closing
from zipfile import ZipFile, ZIP_DEFLATED

import protected_storage as storage
from portable_backup import encode_backup, verify_database, create_backup
from portable_paths import safe_directory
from secure_vault import atomic_write


def eligible(relative):
    parts = relative.parts
    if len(parts) == 1:
        return parts[0] in {
            "registry.db",
            "jarvis.sqlite3",
            ".programming-roots.json",
            ".programming-context.json",
            "legacy-programming-context.json",
            "window-state.json",
            "quick-state.json",
        }
    if parts[0] == "config":
        return len(parts) == 2 and parts[1] in {"settings.json", "preferences.json"}
    if parts == ("general", "project.db"):
        return True
    if parts[0] != "projects" or len(parts) not in {3, 4}:
        return False
    try:
        uuid.UUID(parts[1])
    except ValueError:
        return False
    return (len(parts) == 3 and parts[2] in {"project.db", "IDEIA.md"}) or (
        len(parts) == 4
        and parts[2] == "arquivos"
        and parts[3]
        in {
            "ARCHITECTURE.md",
            "DECISIONS.md",
            "FEATURES.md",
            "PROBLEMS.md",
            "FILE_INDEX.json",
        }
    )


def inventory(source):
    source = Path(source).absolute()
    if source.resolve() != source or not source.is_dir():
        raise ValueError("Origem indisponível ou redirecionada.")
    if (source / ".local-token").exists():
        raise ValueError("Encerre a versão anterior pela bandeja antes de migrar.")
    files = []
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if not eligible(relative) or not path.is_file():
            continue
        if (
            path.resolve() != path.absolute()
            or path.is_symlink()
            or path.stat().st_nlink != 1
            or path.stat().st_size > storage.LIMIT
        ):
            raise ValueError(
                "Arquivo de origem inválido, compartilhado ou grande demais."
            )
        if (
            path.suffix in {".db", ".sqlite3"}
            and Path(str(path) + "-wal").exists()
            and Path(str(path) + "-wal").stat().st_size
        ):
            raise ValueError(
                "Origem possui transações WAL. Abra e encerre corretamente a versão anterior."
            )
        files.append((path, relative.as_posix()))
    if not any(
        relative in {"registry.db", "jarvis.sqlite3", "config/settings.json"}
        for _, relative in files
    ):
        raise ValueError("Nenhuma memória JARVIS reconhecida nesta pasta.")
    if sum(path.stat().st_size for path, _ in files) > 512 * 1024**2:
        raise ValueError("Migração excede o limite de 512 MiB.")
    return files


def migrate(source, destination, key, confirmed=False):
    if confirmed is not True:
        raise ValueError("Migração exige confirmação humana.")
    source, destination = Path(source).absolute(), Path(destination).absolute()
    files = inventory(source)
    safe_directory(destination)
    if (destination / ".local-token").exists():
        raise ValueError("Encerre o JARVIS antes de migrar.")
    vault = (destination / "config/credentials.vault").read_bytes()
    transaction = uuid.uuid4().hex
    staging = destination.with_name(".migration-stage-" + transaction)
    preserved = destination.with_name("data-before-migration-" + transaction)
    safe_directory(staging / "config")
    atomic_write(staging / "config/credentials.vault", vault)
    manifest = {"format": 1, "databases": 3, "files": {}}
    archive_bytes = io.BytesIO()
    with ZipFile(archive_bytes, "w", compression=ZIP_DEFLATED) as archive:
        for path, relative in files:
            raw = path.read_bytes()
            if raw.startswith(storage.MAGIC):
                raise ValueError(
                    "Origem já criptografada: use restauração de backup, sem recriptografar arquivos."
                )
            if path.suffix in {".db", ".sqlite3"}:
                verify_database(path)
            encoded = storage.seal(raw, key, relative.encode("utf-8"))
            target = staging / relative
            safe_directory(target.parent)
            atomic_write(target, encoded)
            manifest["files"][relative] = hashlib.sha256(encoded).hexdigest()
            archive.writestr("data/" + relative, encoded)
        manifest["files"]["config/credentials.vault"] = hashlib.sha256(
            vault
        ).hexdigest()
        archive.writestr("data/config/credentials.vault", vault)
        archive.writestr("manifest.json", json.dumps(manifest))
    backup_folder = safe_directory(destination.parent / "backups")
    backup = backup_folder / ("jarvis-migration-" + transaction + ".jbackup")
    atomic_write(backup, encode_backup(archive_bytes.getvalue(), key, vault))
    from portable_backup import unpack_verified

    # Validate in memory and into encrypted files only, before touching the destination.
    with storage.session(staging, key):
        for path, relative in files:
            if path.suffix in {".db", ".sqlite3"}:
                verify_database(staging / relative, key, relative)
        from project_store import ProjectStore, database, now

        if (
            not (staging / "registry.db").exists()
            and (staging / "jarvis.sqlite3").exists()
        ):
            store = ProjectStore(staging)
            legacy = storage.read_bytes(staging / "jarvis.sqlite3")
            with closing(sqlite3.connect(":memory:")) as old:
                old.deserialize(legacy)
                rows = old.execute(
                    "SELECT role,content FROM messages ORDER BY id"
                ).fetchall()
            with database(store.db_path()) as con:
                con.executemany(
                    "INSERT INTO messages(chat_id,role,content,created_at) VALUES(?,?,?,?)",
                    [
                        (store.general_chat(), role, content, now())
                        for role, content in rows
                    ],
                )
        else:
            ProjectStore(staging)
        # Preserve destination defaults where the source has no corresponding settings.
        defaults = destination / "config/settings.json"
        if defaults.exists() and not (staging / "config/settings.json").exists():
            content = defaults.read_bytes()
            atomic_write(
                staging / "config/settings.json",
                (
                    content
                    if content.startswith(storage.MAGIC)
                    else storage.seal(content, key, b"config/settings.json")
                ),
            )
        backup = create_backup(staging, backup_folder)
    if source != destination and (destination / "registry.db").exists():
        with storage.session(destination, key):
            create_backup(destination, backup_folder)
    journal = destination.with_name(".migration-transaction.json")
    atomic_write(
        journal, json.dumps({"id": transaction, "name": destination.name}).encode()
    )
    destination.rename(preserved)
    try:
        staging.rename(destination)
    except OSError:
        preserved.rename(destination)
        raise
    journal.unlink()
    return {
        "files": len(files),
        "backup": backup,
        "previous": preserved,
        "source_preserved": source != destination or preserved.exists(),
    }


def recover(destination):
    destination = Path(destination).absolute()
    journal = destination.with_name(".migration-transaction.json")
    if not journal.exists():
        return
    if journal.is_symlink() or journal.stat().st_nlink != 1:
        raise ValueError("Diário de migração inválido.")
    value = json.loads(journal.read_text())
    token = uuid.UUID(value["id"]).hex
    if value["name"] != destination.name:
        raise ValueError("Migração incompatível.")
    previous = destination.with_name("data-before-migration-" + token)
    if not destination.exists():
        safe_directory(previous)
        previous.rename(destination)
    journal.unlink()


def wizard(destination, key, force=False):
    import tkinter as tk
    from tkinter import messagebox, filedialog

    destination = Path(destination)
    existing_plain = any(
        path.exists() and not path.read_bytes().startswith(storage.MAGIC)
        for path in [destination / "registry.db", destination / "config/settings.json"]
    )
    candidate = (
        Path(os.getenv("LOCALAPPDATA", str(Path.home() / "AppData/Local"))) / "JARVIS"
    )
    if (
        not force
        and not existing_plain
        and (
            (destination / "registry.db").exists()
            or not (candidate / "registry.db").exists()
        )
    ):
        return True
    window = tk.Tk()
    window.withdraw()
    try:
        if existing_plain:
            source = destination
        else:
            if not messagebox.askyesno(
                "Migrar sua memória",
                "Deseja importar uma instalação anterior? A origem não será apagada. Criaremos um backup criptografado antes da migração.",
                parent=window,
            ):
                return True
            selected = filedialog.askdirectory(
                title="Pasta de dados anterior (contém registry.db ou jarvis.sqlite3)",
                initialdir=str(candidate.parent),
                parent=window,
            )
            if not selected:
                return not force
            source = Path(selected)
        files = inventory(source)
        details = "\n".join(relative for _, relative in files[:25])
        confirmed = messagebox.askyesno(
            "Confirmar migração",
            f"Origem: {source}\nDestino: {destination}\n\n{len(files)} arquivos reconhecidos:\n{details}\n\nConversas, projetos, memória e configurações serão importados. A memória atual será preservada em outra pasta. Dados originais antigos continuam sem criptografia; não fazemos apagamento seguro em USB. Continuar?",
            default="no",
            parent=window,
        )
        if not confirmed:
            return not existing_plain
        migrate(source, destination, key, confirmed=True)
        messagebox.showinfo(
            "Migração",
            "Migração validada. Originais e backup protegidos foram preservados. Pastas externas de projetos podem ficar indisponíveis em outro computador.",
            parent=window,
        )
        return True
    except (OSError, ValueError, sqlite3.DatabaseError):
        messagebox.showerror(
            "Migração",
            "Não foi possível migrar. A origem foi preservada. Confira se a versão anterior está encerrada e se há espaço no dispositivo.",
            parent=window,
        )
        return False
    finally:
        window.destroy()
