"""Non-destructive installer transaction, with recoverable app-only replacement."""

import ctypes
import json
import os
import shutil
import uuid
from pathlib import Path

from portable_paths import safe_directory
from secure_vault import atomic_write

FORMAT = 1


def removable_drives():
    if os.name != "nt":
        return []
    from ctypes import wintypes

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetDriveTypeW.argtypes = [wintypes.LPCWSTR]
    drives = []
    for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
        root = f"{letter}:\\"
        if kernel.GetDriveTypeW(root) != 2:
            continue
        label, system = ctypes.create_unicode_buffer(261), ctypes.create_unicode_buffer(
            261
        )
        if not kernel.GetVolumeInformationW(
            root, label, 261, None, None, None, system, 261
        ):
            continue
        try:
            usage = shutil.disk_usage(root)
            drives.append(
                {
                    "path": root,
                    "name": label.value or "Unidade removível",
                    "total": usage.total,
                    "free": usage.free,
                    "filesystem": system.value,
                }
            )
        except OSError:
            continue
    return drives


def validate_destination(destination, required, manual_confirmed=False):
    destination = Path(destination).absolute()
    if os.name == "nt":
        system = os.environ.get("SystemDrive", "C:") + "\\"
        if destination.anchor.casefold() == system.casefold():
            raise ValueError(
                "Selecione um dispositivo externo, fora da unidade do Windows."
            )
        known = {item["path"].casefold() for item in removable_drives()}
        if destination.anchor.casefold() not in known and manual_confirmed is not True:
            raise ValueError(
                "Confirme explicitamente o dispositivo removível escolhido manualmente."
            )
    if not destination.is_dir():
        raise ValueError("Destino indisponível. Reconecte o dispositivo.")
    safe_directory(destination)
    if shutil.disk_usage(destination).free < required:
        raise ValueError(
            "Espaço insuficiente. Libere espaço ou escolha outro dispositivo."
        )
    probe = destination / (".jarvis-write-" + uuid.uuid4().hex)
    try:
        with probe.open("xb") as stream:
            stream.write(b"JARVIS")
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        if probe.exists():
            probe.unlink()
    return destination


def recover_install(root):
    """A journal can only name direct, installer-owned UUID directories."""
    journal = root / ".install-transaction.json"
    if not journal.exists():
        return
    if journal.is_symlink() or journal.stat().st_nlink != 1:
        raise ValueError("Transação redirecionada.")
    value = json.loads(journal.read_text(encoding="utf-8"))
    transaction = str(uuid.UUID(value["id"]))
    staging, old = root / (".app-stage-" + transaction), root / (
        ".app-before-" + transaction
    )
    for folder in [staging, old, root / "app"]:
        if folder.exists():
            safe_directory(folder)
    version = root / "VERSION"
    marker = root / "portable-install.json"
    committed = (
        marker.exists()
        and json.loads(marker.read_text()).get("transaction") == transaction
    )
    if not committed:
        if "previous_version" in value:
            if value["previous_version"] is None:
                if version.exists():
                    version.unlink()
            else:
                atomic_write(version, value["previous_version"].encode("utf-8"))
        previous_launcher = root / (".launcher-before-" + transaction)
        if previous_launcher.exists():
            if previous_launcher.is_symlink() or previous_launcher.stat().st_nlink != 1:
                raise ValueError("Iniciador de recuperação inválido.")
            atomic_write(
                root.parent / "Iniciar JARVIS.exe", previous_launcher.read_bytes()
            )
        if old.exists():
            if (root / "app").exists():
                # Preserve the interrupted new payload as well, never delete unknown files.
                (root / "app").rename(root / (".app-interrupted-" + transaction))
            old.rename(root / "app")
        elif not value["update"] and (root / "app").exists():
            (root / "app").rename(root / (".app-interrupted-" + transaction))
    journal.unlink()


def _install(
    payload,
    launcher,
    destination,
    version,
    settings=None,
    vault=None,
    manual_confirmed=False,
    progress=lambda value, text: None,
):
    import re

    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-dev\.\d+)?", version):
        raise ValueError("Versão de instalação inválida.")
    payload, launcher = Path(payload), Path(launcher)
    if not payload.is_file() or not launcher.is_file():
        raise ValueError("Pacote incompleto. Obtenha novamente o JARVIS Setup.")
    required = payload.stat().st_size * 2 + launcher.stat().st_size + 512 * 1024**2
    destination = validate_destination(destination, required, manual_confirmed)
    root = destination / "JARVIS"
    marker = root / "portable-install.json"
    if root.exists() and not marker.exists():
        raise ValueError(
            "Já existe uma pasta JARVIS sem identificação do instalador. Nenhum arquivo foi alterado."
        )
    safe_directory(root)
    if marker.exists():
        if (
            marker.is_symlink()
            or marker.stat().st_nlink != 1
            or json.loads(marker.read_text()).get("format") != FORMAT
        ):
            raise ValueError("Instalação existente incompatível.")
        if (root / "data" / ".local-token").exists():
            raise ValueError("Encerre o JARVIS pela bandeja antes de atualizar.")
    else:
        atomic_write(marker, json.dumps({"format": FORMAT}).encode())
    from portable_backup import recover_restore

    recover_restore(root / "data")
    recover_install(root)
    launcher_target = destination / "Iniciar JARVIS.exe"
    if launcher_target.exists():
        import hashlib

        if (
            launcher_target.is_symlink()
            or launcher_target.stat().st_nlink != 1
            or (
                hashlib.sha256(launcher_target.read_bytes()).digest()
                != hashlib.sha256(launcher.read_bytes()).digest()
                and hashlib.sha256(launcher_target.read_bytes()).hexdigest()
                != json.loads(marker.read_text()).get("launcher_sha256")
            )
        ):
            raise ValueError(
                "Já existe um Iniciar JARVIS.exe diferente. Nenhum arquivo será sobrescrito."
            )
    update = (root / "app").exists()
    if update:
        from portable_backup import create_backup

        progress(5, "Verificando e preservando os dados existentes")
        create_backup(root / "data", root / "backups")
    transaction = str(uuid.uuid4())
    if launcher_target.exists():
        atomic_write(
            root / (".launcher-before-" + transaction), launcher_target.read_bytes()
        )
    staging, old = root / (".app-stage-" + transaction), root / (
        ".app-before-" + transaction
    )
    staging.mkdir()
    progress(15, "Copiando aplicativo e componentes integrados")
    try:
        target = staging / "JARVIS.exe"
        total, copied = payload.stat().st_size, 0
        with payload.open("rb") as source, target.open("xb") as output:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
                copied += len(chunk)
                progress(15 + int(55 * copied / max(total, 1)), "Copiando aplicativo")
            output.flush()
            os.fsync(output.fileno())
        import hashlib

        with payload.open("rb") as source, target.open("rb") as output:
            if (
                hashlib.file_digest(source, "sha256").digest()
                != hashlib.file_digest(output, "sha256").digest()
            ):
                raise ValueError("Falha de integridade ao copiar o aplicativo.")
        for folder in ["config", "database", "projects", "memory", "cache", "logs"]:
            safe_directory(root / "data" / folder)
        safe_directory(root / "backups")
        if not (root / "data/config/settings.json").exists():
            import protected_storage

            protected_storage.write_bytes(
                root / "data/config/settings.json",
                json.dumps(settings or {}, ensure_ascii=False).encode("utf-8"),
            )
        if vault is not None and not (root / "data/config/credentials.vault").exists():
            atomic_write(root / "data/config/credentials.vault", bytes(vault))
        atomic_write(
            root / ".install-transaction.json",
            json.dumps(
                {
                    "id": transaction,
                    "version": version,
                    "update": update,
                    "previous_version": (
                        (root / "VERSION").read_text(encoding="utf-8")
                        if (root / "VERSION").exists()
                        else None
                    ),
                }
            ).encode(),
        )
        if update:
            (root / "app").rename(old)
        staging.rename(root / "app")
        atomic_write(launcher_target, launcher.read_bytes())
        atomic_write(root / "VERSION", (version + "\n").encode())
        atomic_write(
            marker,
            json.dumps(
                {
                    "format": FORMAT,
                    "transaction": transaction,
                    "launcher_sha256": hashlib.sha256(
                        launcher.read_bytes()
                    ).hexdigest(),
                }
            ).encode(),
        )
        (root / ".install-transaction.json").unlink()
        progress(100, "Instalação concluída. Os dados anteriores foram preservados.")
        return root
    except Exception:
        recover_install(root)
        raise
    # Staging/previous app folders are intentionally preserved on interruption/update.


def install(*args, data_key=None, **kwargs):
    if data_key is None:
        return _install(*args, **kwargs)
    import protected_storage

    destination = args[2] if len(args) > 2 else kwargs["destination"]
    with protected_storage.session(Path(destination) / "JARVIS/data", data_key):
        return _install(*args, **kwargs)
