"""Controle local: somente operações registradas, sem comandos fornecidos pela IA."""

import os
import platform
import secrets
import subprocess
import time
from pathlib import Path
from typing import Literal

import psutil
from pydantic import BaseModel, ConfigDict


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ApplicationRequest(StrictRequest):
    app: Literal["notepad", "calculator", "vscode"]


class FolderRequest(StrictRequest):
    folder: Literal["desktop", "documents", "downloads"]


class EmptyRequest(StrictRequest):
    pass


class ConfirmationRequest(StrictRequest):
    confirmation_id: str
    approved: bool


APPS = {"notepad": "Bloco de Notas", "calculator": "Calculadora", "vscode": "VS Code"}
FOLDERS = {"desktop": "Desktop", "documents": "Documents", "downloads": "Downloads"}
PENDING_TTL = 120
pending = {}


def request_action(kind, target):
    allowed = APPS if kind == "application" else FOLDERS if kind == "folder" else {}
    if target not in allowed:
        raise ValueError("Ação não permitida.")
    now = time.monotonic()
    for key, value in list(pending.items()):
        if value["expires"] <= now:
            pending.pop(key, None)
    if len(pending) >= 100:
        raise ValueError("Há muitas confirmações pendentes.")
    identifier = secrets.token_urlsafe(32)
    description = (
        f"Abrir {'aplicativo' if kind == 'application' else 'pasta'}: {allowed[target]}"
    )
    pending[identifier] = {"kind": kind, "target": target, "expires": now + PENDING_TTL}
    return {
        "confirmation_id": identifier,
        "description": description,
        "expires_in_seconds": PENDING_TTL,
    }


def application_path(name):
    # Nunca resolve executáveis pelo PATH ou pelo diretório de trabalho.
    windows = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    if name in ("notepad", "calculator"):
        return (
            windows / "System32" / ("notepad.exe" if name == "notepad" else "calc.exe")
        )
    if name == "vscode":
        candidates = [
            Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
            / "Programs"
            / "Microsoft VS Code"
            / "Code.exe",
            Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
            / "Microsoft VS Code"
            / "Code.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return candidate
    raise ValueError("Aplicativo permitido não encontrado na instalação padrão.")


def folder_path(name):
    if name not in FOLDERS:
        raise ValueError("Pasta não permitida.")
    target = Path.home() / FOLDERS[name]
    if not target.is_dir() or target.resolve() != target.absolute():
        raise ValueError(
            "Pasta indisponível ou redirecionada. A abertura foi bloqueada."
        )
    return target


def confirm_action(identifier, approved):
    action = pending.pop(identifier, None)
    if action is None or action["expires"] <= time.monotonic():
        raise ValueError("Confirmação inválida, expirada ou já utilizada.")
    if not approved:
        return {"result": "Ação cancelada."}
    if platform.system() != "Windows":
        return {"result": "Esta ação está disponível apenas no Windows."}
    if action["kind"] == "application":
        command = [str(application_path(action["target"]))]
    else:
        target = folder_path(action["target"])
        command = [
            str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "explorer.exe"),
            str(target),
        ]
    try:
        flags = (
            subprocess.CREATE_BREAKAWAY_FROM_JOB
            if os.name == "nt" and os.getenv("JARVIS_LAUNCHER_JOB") == "1"
            else 0
        )
        subprocess.Popen(
            command,
            shell=False,
            creationflags=flags,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return {"result": "Não foi possível iniciar o aplicativo ou abrir a pasta."}
    return {"result": "Solicitação de abertura enviada ao Windows."}


def list_processes():
    items = []
    for process in psutil.process_iter(["pid", "name"]):
        try:
            items.append({"pid": process.info["pid"], "name": process.info["name"]})
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    items.sort(key=lambda item: (item["name"] or "").lower())
    return {
        "processes": items[:200],
        "total": len(items),
        "truncated": len(items) > 200,
    }


def system_information():
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage(Path.home().anchor)
    return {
        "os": platform.system(),
        "release": platform.release(),
        "architecture": platform.machine(),
        "cpu_logical_count": psutil.cpu_count(),
        "memory_total_bytes": memory.total,
        "memory_available_bytes": memory.available,
        "memory_percent": memory.percent,
        "system_disk_total_bytes": disk.total,
        "system_disk_free_bytes": disk.free,
    }


TOOL_SPECS = [
    (
        "open_application",
        "Solicita confirmação humana para abrir um aplicativo permitido.",
        ApplicationRequest,
    ),
    (
        "open_folder",
        "Solicita confirmação humana para abrir uma pasta autorizada.",
        FolderRequest,
    ),
    (
        "list_processes",
        "Consulta PID e nome dos processos; não retorna comandos ou ambientes.",
        EmptyRequest,
    ),
    (
        "get_system_info",
        "Consulta sistema, arquitetura, CPU, memória e espaço em disco.",
        EmptyRequest,
    ),
]
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": model.model_json_schema(),
        },
    }
    for name, description, model in TOOL_SPECS
]


def dispatch(name, arguments):
    models = {name: model for name, _, model in TOOL_SPECS}
    if name not in models:
        raise ValueError("Ferramenta não permitida.")
    request = models[name].model_validate_json(arguments)
    if name == "open_application":
        return {"pending_action": request_action("application", request.app)}
    if name == "open_folder":
        return {"pending_action": request_action("folder", request.folder)}
    if name == "list_processes":
        return list_processes()
    return system_information()
