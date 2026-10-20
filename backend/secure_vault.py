"""Versioned portable credentials: scrypt + AES-256-GCM, no machine-bound key."""

import os
import base64
import json
import tempfile
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

MAGIC = b"JARVIS-VAULT\x01"
MAX_SIZE = 64 * 1024


def derive(password, salt):
    if not isinstance(password, str) or len(password) < 12 or len(password) > 1024:
        raise ValueError("Use uma senha mestra de 12 a 1024 caracteres.")
    return Scrypt(salt=salt, length=32, n=2**17, r=8, p=1).derive(
        password.encode("utf-8")
    )


def encrypt(content, password):
    salt, nonce = os.urandom(16), os.urandom(12)
    header = MAGIC + salt + nonce
    return header + AESGCM(derive(password, salt)).encrypt(nonce, content, header)


def decrypt(content, password):
    offset = len(MAGIC)
    if len(content) < offset + 44 or not content.startswith(MAGIC):
        raise ValueError("Cofre inválido ou de versão incompatível.")
    salt, nonce = content[offset : offset + 16], content[offset + 16 : offset + 28]
    header = content[: offset + 28]
    try:
        return AESGCM(derive(password, salt)).decrypt(
            nonce, content[len(header) :], header
        )
    except InvalidTag:
        raise ValueError("Senha incorreta ou cofre danificado.") from None


def atomic_write(path, content):
    path = Path(path).absolute()
    from portable_paths import safe_directory

    safe_directory(path.parent)
    if path.is_symlink() or (path.exists() and path.stat().st_nlink != 1):
        raise ValueError("Arquivo privado redirecionado ou compartilhado.")
    fd, name = tempfile.mkstemp(prefix=".jarvis-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def save_key(path, api_key, password, data_key=None):
    if (
        not isinstance(api_key, str)
        or not api_key.startswith("sk-")
        or not 20 <= len(api_key) <= 512
        or any(c.isspace() for c in api_key)
    ):
        raise ValueError("Informe uma chave da OpenAI API válida, iniciada por sk-.")
    if Path(path).exists() and data_key is None:
        raise ValueError(
            "A troca do cofre deve preservar a chave dos dados existentes."
        )
    data_key = data_key if data_key is not None else os.urandom(32)
    if len(data_key) != 32:
        raise ValueError("Chave de dados inválida.")
    content = json.dumps(
        {
            "format": 2,
            "api_key": api_key,
            "data_key": base64.b64encode(data_key).decode("ascii"),
        }
    ).encode("utf-8")
    atomic_write(path, encrypt(content, password))


def load_bundle(path, password):
    path = Path(path)
    from portable_paths import safe_directory

    safe_directory(path.parent)
    if path.is_symlink() or path.stat().st_nlink != 1 or path.stat().st_size > MAX_SIZE:
        raise ValueError("Arquivo de credenciais inválido.")
    value = decrypt(path.read_bytes(), password).decode("utf-8")
    if value.startswith("sk-"):
        # Upgrade the previous credential-only vault without exposing its key to disk.
        save_key(path, value, password, data_key=os.urandom(32))
        return load_bundle(path, password)
    return parse_bundle(value)


def decode_bundle(content, password):
    return parse_bundle(decrypt(content, password).decode("utf-8"))


def parse_bundle(value):
    bundle = json.loads(value)
    if not isinstance(bundle, dict):
        raise ValueError("Formato de cofre incompatível.")
    if bundle.get("format") != 2 or not isinstance(bundle.get("api_key"), str):
        raise ValueError("Formato de cofre incompatível.")
    key = base64.b64decode(bundle["data_key"], validate=True)
    if len(key) != 32:
        raise ValueError("Chave de dados inválida.")
    return {"api_key": bundle["api_key"], "data_key": key}


def load_key(path, password):
    return load_bundle(path, password)["api_key"]
