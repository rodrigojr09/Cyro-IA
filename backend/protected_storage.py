"""Authenticated files and RAM-only SQLite; no plaintext journals or temp databases."""

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from secure_vault import atomic_write

MAGIC = b"JARVIS-DATA\x01"
LIMIT = 128 * 1024**2
_root = None
_key = None
_lock = threading.RLock()
_active = threading.local()


@contextmanager
def session(root, key):
    global _root, _key
    with _lock:
        previous = _root, _key
        configure(root, key)
        try:
            yield
        finally:
            _root, _key = previous


def configure(root=None, key=None):
    global _root, _key
    if key is not None and len(key) != 32:
        raise ValueError("Chave de dados inválida.")
    _root, _key = (Path(root).absolute() if root is not None else None), key


def enabled(path):
    return _root is not None and Path(path).absolute().is_relative_to(_root)


def data_key():
    if _key is None:
        raise ValueError("Cofre bloqueado.")
    return _key


def context(path):
    path = Path(path).absolute()
    if (
        not enabled(path)
        or path.resolve() != path
        or (path.exists() and path.stat().st_nlink != 1)
    ):
        raise ValueError("Arquivo protegido inválido ou redirecionado.")
    return path.relative_to(_root).as_posix().encode("utf-8")


def seal(content, key, associated):
    nonce = os.urandom(12)
    return MAGIC + nonce + AESGCM(key).encrypt(nonce, content, MAGIC + associated)


def unseal(content, key, associated):
    if not content.startswith(MAGIC) or len(content) < len(MAGIC) + 28:
        raise ValueError(
            "Dados não criptografados ou formato incompatível. Use a migração guiada."
        )
    try:
        return AESGCM(key).decrypt(
            content[len(MAGIC) : len(MAGIC) + 12],
            content[len(MAGIC) + 12 :],
            MAGIC + associated,
        )
    except InvalidTag:
        raise ValueError(
            "Falha de autenticação: arquivo danificado, trocado ou chave incorreta."
        ) from None


def read_bytes(path):
    path = Path(path)
    if path.stat().st_size > LIMIT:
        raise ValueError("Arquivo excede o limite seguro de 128 MiB.")
    associated = context(path) if enabled(path) else None
    content = path.read_bytes()
    return (
        unseal(content, data_key(), associated) if associated is not None else content
    )


def write_bytes(path, content):
    if len(content) > LIMIT:
        raise ValueError("Arquivo excede o limite seguro de 128 MiB.")
    if enabled(path):
        content = seal(content, data_key(), context(path))
    atomic_write(path, content)


def read_text(path, encoding="utf-8"):
    return read_bytes(path).decode(encoding)


def write_text(path, text, encoding="utf-8"):
    write_bytes(path, text.encode(encoding))


@contextmanager
def database(path):
    """Serialize threads; a failed transaction never publishes an image."""
    with _lock:
        active = getattr(_active, "connections", {})
        identity = str(Path(path).absolute())
        if identity in active:
            yield active[identity]
            return
        original = read_bytes(path) if Path(path).exists() else None
        con = sqlite3.connect(":memory:")
        try:
            con.execute("PRAGMA temp_store=MEMORY")
            if original is not None:
                con.deserialize(original)
            con.row_factory = sqlite3.Row
            con.execute("PRAGMA foreign_keys=ON")
            con.execute("PRAGMA journal_mode=MEMORY")

            def authorize(action, arg1, arg2, db, trigger):
                return (
                    sqlite3.SQLITE_DENY
                    if action in {sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH}
                    else sqlite3.SQLITE_OK
                )

            con.set_authorizer(authorize)
            active[identity] = con
            _active.connections = active
            with con:
                yield con
            image = con.serialize()
            if image != original:
                write_bytes(path, image)
        finally:
            active.pop(identity, None)
            con.close()
