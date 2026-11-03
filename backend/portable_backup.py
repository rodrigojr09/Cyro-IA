"""Verified, offline snapshots. Restore builds a new directory, never merges databases."""

import hashlib
import io
import json
import os
import shutil
import sqlite3
import tempfile
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED

from portable_paths import safe_directory
from secure_vault import atomic_write
import protected_storage
from storage_versions import CATALOG_VERSION, MEMORY_VERSION

BACKUP_MAGIC = b"JARVIS-BACKUP\x02"


def encode_backup(content, key, vault):
    header = BACKUP_MAGIC + len(vault).to_bytes(4, "big") + vault
    return header + protected_storage.seal(content, key, header)


def decode_backup(content, key=None, password=None):
    if not content.startswith(BACKUP_MAGIC):
        if key is not None:
            raise ValueError("Backup antigo sem criptografia. Use a migração guiada.")
        return content, None
    offset = len(BACKUP_MAGIC)
    size = int.from_bytes(content[offset : offset + 4], "big")
    if not 1 <= size <= 65536 or len(content) < offset + 4 + size:
        raise ValueError("Cabeçalho de backup inválido.")
    header = content[: offset + 4 + size]
    if password is not None:
        from secure_vault import decode_bundle

        key = decode_bundle(content[offset + 4 : len(header)], password)["data_key"]
    if key is None:
        raise ValueError("Desbloqueie o cofre para restaurar.")
    return protected_storage.unseal(content[len(header) :], key, header), key


MAX_BACKUP_BYTES = 512 * 1024**2


def verify_database(path, key=None, relative=None):
    content = Path(path).read_bytes()
    if content.startswith(protected_storage.MAGIC):
        content = protected_storage.unseal(
            content,
            key or protected_storage.data_key(),
            (relative or protected_storage.context(path).decode()).encode(),
        )
    with closing(sqlite3.connect(":memory:")) as con:
        con.execute("PRAGMA temp_store=MEMORY")
        con.deserialize(content)
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Backup contém banco danificado.")
        supported = CATALOG_VERSION if Path(path).name == "registry.db" else MEMORY_VERSION
        if con.execute("PRAGMA user_version").fetchone()[0] > supported:
            raise ValueError("Backup requer uma versão mais recente do JARVIS.")


def checked_files(root, key=None):
    for path in root.rglob("*"):
        if path.is_symlink() or path.resolve() != path.absolute():
            raise ValueError("Backup recusou um caminho redirecionado.")
        if not path.is_file():
            continue
        if path.stat().st_nlink != 1:
            raise ValueError("Backup recusou um arquivo compartilhado.")
        relative = path.relative_to(root)
        if (
            relative.parts[0] in {"cache", "logs"}
            or relative.parts[:2] == ("config", "electron")
            or path.name in {".local-token", ".env"}
            or path.suffix == ".tmp"
        ):
            continue
        if (
            key is not None
            and relative.as_posix() != "config/credentials.vault"
            and not path.read_bytes().startswith(protected_storage.MAGIC)
        ):
            raise ValueError(
                "O perfil contém dados antigos sem criptografia; conclua a migração guiada."
            )
        if path.suffix in {".db", ".sqlite", ".sqlite3"}:
            verify_database(path, key, relative.as_posix())
        yield path, relative.as_posix()


def require_offline(root):
    if (root / ".local-token").exists():
        raise ValueError(
            "Encerre o JARVIS pela bandeja antes de fazer backup ou restaurar."
        )


def create_backup(data, destination, retention=5):
    if type(retention) is not int or not 1 <= retention <= 100:
        raise ValueError("A retenção deve ser de 1 a 100 backups.")
    root = Path(data).absolute()
    safe_directory(root)
    require_offline(root)
    target = safe_directory(destination)
    if target.is_relative_to(root):
        raise ValueError("A pasta de backups deve ficar fora da pasta data.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    key = protected_storage.data_key() if protected_storage.enabled(root) else None
    name = target / f"jarvis-{stamp}-{uuid.uuid4().hex}{'.jbackup' if key else '.zip'}"
    pending = name.with_suffix(".partial")
    try:
        manifest = {"format": 1, "databases": 3, "files": {}}
        total = 0
        buffer = io.BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            for file, relative in checked_files(root, key):
                total += file.stat().st_size
                if total > MAX_BACKUP_BYTES:
                    raise ValueError(
                        "Perfil excede o limite de backup em memória de 512 MiB."
                    )
                content = file.read_bytes()
                manifest["files"][relative] = hashlib.sha256(content).hexdigest()
                archive.writestr("data/" + relative, content)
            archive.writestr("manifest.json", json.dumps(manifest))
        content = buffer.getvalue()
        if key is not None:
            content = encode_backup(
                content, key, (root / "config/credentials.vault").read_bytes()
            )
        atomic_write(pending, content)
        # Verify actual archived bytes and SQLite, rather than trusting write success.
        with tempfile.TemporaryDirectory(dir=target, prefix=".verify-") as folder:
            unpack_verified(pending, folder, key=key)
        pending.replace(name)
        previous = sorted(
            (p for p in target.glob("jarvis-*" + name.suffix) if p != name),
            key=lambda p: p.stat().st_mtime_ns,
            reverse=True,
        )
        for file in previous[retention - 1 :]:
            if file.is_file() and not file.is_symlink() and file.stat().st_nlink == 1:
                file.unlink()
        return name
    finally:
        if pending.exists():
            pending.unlink()


def unpack_verified(backup, destination, key=None, password=None):
    root = safe_directory(destination)
    if Path(backup).stat().st_size > MAX_BACKUP_BYTES:
        raise ValueError("Backup excede os limites de restauração.")
    raw, key = decode_backup(Path(backup).read_bytes(), key, password)
    with ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if (
            len(entries) > 100000
            or sum(e.file_size for e in entries) > MAX_BACKUP_BYTES
        ):
            raise ValueError("Backup excede os limites de restauração.")
        names = [e.filename for e in entries]
        if len({n.casefold() for n in names}) != len(names):
            raise ValueError("Backup contém entradas duplicadas.")
        if (
            "manifest.json" not in names
            or archive.getinfo("manifest.json").file_size > 16 * 1024**2
        ):
            raise ValueError("Manifesto inválido.")
        manifest = json.loads(archive.read("manifest.json"))
        if (
            manifest.get("format") != 1
            or manifest.get("databases") not in {2, 3}
            or not isinstance(manifest.get("files"), dict)
        ):
            raise ValueError("Backup incompatível.")
        if set(names) != {"manifest.json", *("data/" + n for n in manifest["files"])}:
            raise ValueError("Conteúdo não corresponde ao manifesto.")
        for relative, digest in manifest["files"].items():
            part = PurePosixPath(relative)
            reserved = {
                "CON",
                "PRN",
                "AUX",
                "NUL",
                *(f"COM{i}" for i in range(1, 10)),
                *(f"LPT{i}" for i in range(1, 10)),
            }
            if (
                not part.parts
                or part.is_absolute()
                or any(
                    p in {"..", "."}
                    or any(c in p for c in ':\\<>"|?*')
                    or any(ord(c) < 32 for c in p)
                    or p.split(".")[0].upper() in reserved
                    or p.endswith((".", " "))
                    for p in part.parts
                )
                or part.name in {".local-token", ".env"}
            ):
                raise ValueError("Caminho inseguro no backup.")
            content = archive.read("data/" + relative)
            if hashlib.sha256(content).hexdigest() != digest:
                raise ValueError("Backup falhou na verificação de integridade.")
            file = root.joinpath(*part.parts)
            safe_directory(file.parent)
            with file.open("xb") as stream:
                stream.write(content)
        for file, _ in checked_files(root, key):
            pass


def restore_backup(backup, data, confirmed=False, password=None):
    if confirmed is not True:
        raise ValueError("A restauração exige confirmação humana explícita.")
    root = Path(data).absolute()
    recover_restore(root)
    safe_directory(root)
    require_offline(root)
    transaction = uuid.uuid4().hex
    staging = root.with_name(".restore-" + transaction)
    preserved = root.with_name("data-before-restore-" + transaction)
    journal = root.with_name(".restore-transaction.json")
    staging.mkdir()
    try:
        key = protected_storage.data_key() if protected_storage.enabled(root) else None
        unpack_verified(backup, staging, key, password)
        atomic_write(
            journal, json.dumps({"id": transaction, "data": root.name}).encode()
        )
        root.rename(preserved)
        try:
            staging.rename(root)
        except OSError:
            preserved.rename(root)
            raise
        journal.unlink()
        return preserved
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def recover_restore(data):
    root = Path(data).absolute()
    journal = root.with_name(".restore-transaction.json")
    if not journal.exists():
        return
    safe_directory(root.parent)
    if journal.is_symlink() or journal.stat().st_nlink != 1:
        raise ValueError("Transação de restauração redirecionada.")
    value = json.loads(journal.read_text())
    transaction = uuid.UUID(value["id"]).hex
    if value.get("data") != root.name:
        raise ValueError("Transação de restauração incompatível.")
    preserved = root.with_name("data-before-restore-" + transaction)
    staging = root.with_name(".restore-" + transaction)
    if preserved.is_dir() and (staging.exists() or not root.exists()):
        safe_directory(preserved)
        if root.exists():
            safe_directory(root)
            root.rename(root.with_name(".restore-interrupted-" + transaction))
        preserved.rename(root)
    elif not root.exists():
        raise ValueError("Restauração interrompida exige recuperar a pasta anterior.")
    journal.unlink()
