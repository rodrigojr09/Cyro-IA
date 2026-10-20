"""Opt-in current-user USB watcher. No administrator privileges or USB AutoRun."""

import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid

RUN_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_NAME = "JARVIS USB autorizado"


def local_folder():
    return Path(os.environ["LOCALAPPDATA"]) / "JARVIS Device Startup"


def volume_id(root):
    if os.name != "nt":
        raise ValueError("Disponível somente no Windows.")
    buffer = ctypes.create_unicode_buffer(1024)
    if not ctypes.windll.kernel32.GetVolumeNameForVolumeMountPointW(
        str(root), buffer, len(buffer)
    ):
        raise OSError("Não foi possível identificar o dispositivo.")
    return buffer.value


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def enable(
    app_root, helper, confirmed=False, registry=None, folder=None, identify=volume_id
):
    if confirmed is not True:
        raise ValueError("A inicialização exige consentimento humano explícito.")
    if registry is None:
        import winreg as registry
    root, helper = Path(app_root).absolute(), Path(helper).absolute()
    executable = root / "app/JARVIS.exe"
    if (
        not executable.is_file()
        or executable.resolve() != executable
        or not helper.is_file()
    ):
        raise ValueError("Instalação portátil inválida.")
    destination = Path(folder) if folder else local_folder()
    if destination.exists() and destination.resolve() != destination.absolute():
        raise ValueError("Pasta de inicialização redirecionada.")
    destination.mkdir(parents=True, exist_ok=True)
    installed = destination / "JARVIS Device Watcher.exe"
    configuration = destination / "settings.json"
    command = subprocess.list2cmdline([str(installed), "--watch"])
    with registry.CreateKey(registry.HKEY_CURRENT_USER, RUN_PATH) as run:
        try:
            existing, _ = registry.QueryValueEx(run, RUN_NAME)
        except FileNotFoundError:
            existing = None
        if existing is not None and existing != command:
            raise ValueError(
                "Já existe outro registro com este nome; não foi substituído."
            )
        if installed.exists():
            if (
                installed.is_symlink()
                or installed.stat().st_nlink != 1
                or digest(installed) != digest(helper)
            ):
                raise ValueError(
                    "Desative a configuração anterior antes de atualizar o monitor."
                )
        else:
            shutil.copyfile(helper, installed)
        config = {
            "format": 1,
            "volume": identify(root.anchor),
            "relative": executable.relative_to(root.anchor).as_posix(),
            "sha256": digest(executable),
        }
        temporary = destination / ("settings-" + uuid.uuid4().hex + ".tmp")
        try:
            with temporary.open("x", encoding="utf-8") as stream:
                json.dump(config, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, configuration)
            registry.SetValueEx(run, RUN_NAME, 0, registry.REG_SZ, command)
        finally:
            if temporary.exists():
                temporary.unlink()
    return installed


def disable(confirmed=False, registry=None, folder=None):
    if confirmed is not True:
        raise ValueError("A desativação exige confirmação humana.")
    if registry is None:
        import winreg as registry
    destination = Path(folder) if folder else local_folder()
    if destination.exists() and destination.resolve() != destination.absolute():
        raise ValueError("Pasta de inicialização redirecionada.")
    with registry.CreateKey(registry.HKEY_CURRENT_USER, RUN_PATH) as run:
        try:
            value, _ = registry.QueryValueEx(run, RUN_NAME)
            expected = subprocess.list2cmdline(
                [str(destination / "JARVIS Device Watcher.exe"), "--watch"]
            )
            if value != expected:
                raise ValueError(
                    "O registro pertence a outro programa; não foi removido."
                )
            registry.DeleteValue(run, RUN_NAME)
        except FileNotFoundError:
            pass
    config = destination / "settings.json"
    if config.exists():
        if config.is_symlink() or config.stat().st_nlink != 1:
            raise ValueError("Configuração redirecionada.")
        config.unlink()  # Running watcher exits when this explicit consent record disappears.
    executable = destination / "JARVIS Device Watcher.exe"
    for _ in range(30):
        try:
            if (
                executable.exists()
                and not executable.is_symlink()
                and executable.stat().st_nlink == 1
            ):
                executable.unlink()
            break
        except PermissionError:
            time.sleep(0.2)


def match(config, candidates, identify=volume_id):
    relative = Path(config["relative"])
    if (
        config.get("format") != 1
        or relative.is_absolute()
        or ".." in relative.parts
        or ":" in str(relative)
        or relative.name.lower() != "jarvis.exe"
    ):
        return None
    for root in candidates:
        try:
            if identify(str(root)) != config["volume"]:
                continue
            executable = Path(root) / relative
            if (
                executable.is_file()
                and executable.resolve() == executable.absolute()
                and digest(executable) == config["sha256"]
            ):
                return executable
        except OSError:
            continue
    return None


def _watch():
    configuration = local_folder() / "settings.json"
    connected = False
    while configuration.is_file():
        try:
            if configuration.is_symlink() or configuration.stat().st_size > 4096:
                return
            config = json.loads(configuration.read_text())
            roots = [
                f"{letter}:\\"
                for letter in "DEFGHIJKLMNOPQRSTUVWXYZ"
                if ctypes.windll.kernel32.GetDriveTypeW(f"{letter}:\\") in {2, 3}
            ]
            if connected:
                present = any(volume_id(root) == config["volume"] for root in roots)
                connected = present
            else:
                executable = match(config, roots)
                if executable:
                    subprocess.Popen(
                        [str(executable)], cwd=executable.parent, shell=False
                    )
                    connected = True
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(3)


def watch():
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    kernel.CreateMutexW.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    name = (
        "Local\\JARVIS-USB-"
        + hashlib.sha256(str(local_folder()).casefold().encode()).hexdigest()[:24]
    )
    handle = kernel.CreateMutexW(None, False, name)
    if not handle:
        return
    try:
        if ctypes.get_last_error() != 183:
            _watch()
    finally:
        kernel.CloseHandle(handle)


def settings_dialog(app_root, helper):
    import tkinter as tk
    from tkinter import ttk, messagebox

    window = tk.Tk()
    window.title("JARVIS — Inicialização autorizada neste computador")
    window.geometry("700x390")
    frame = ttk.Frame(window, padding=25)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Somente neste computador", font=("Segoe UI", 20)).pack(
        anchor="w"
    )
    ttk.Label(
        frame,
        wraplength=640,
        text="Ao ativar, um monitor identificado será registrado na inicialização do seu usuário do Windows. Ele poderá abrir este JARVIS ao detectar este volume, mesmo com outra letra. A senha mestra continuará necessária.\n\nO auxiliar fica em AppData/JARVIS Device Startup e não contém conversas, chave ou senha. Sem ativação prévia não há inicialização automática. Políticas do Windows podem bloquear o recurso. Após atualizar o aplicativo, autorize novamente. Não usamos USB AutoRun.",
    ).pack(anchor="w", pady=15)
    status = ttk.Label(frame, text="")
    status.pack(anchor="w", pady=10)

    def activate():
        if not messagebox.askyesno(
            "Autorizar inicialização",
            "Registrar o monitor para este usuário e iniciar a detecção do dispositivo agora?",
            default="no",
            parent=window,
        ):
            return
        try:
            installed = enable(app_root, helper, confirmed=True)
            subprocess.Popen(
                [str(installed), "--watch"],
                shell=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            status.configure(
                text="Ativado para este computador e usuário. Pode ser desativado aqui ou na inicialização do Windows."
            )
        except (OSError, ValueError):
            status.configure(
                text="Não foi possível ativar. Confira políticas e permissões, ou desative a configuração anterior."
            )

    def deactivate():
        if messagebox.askyesno(
            "Desativar",
            "Remover a inicialização autorizada deste computador?",
            default="no",
            parent=window,
        ):
            try:
                disable(confirmed=True)
                status.configure(
                    text="Inicialização desativada. O monitor encerrará a detecção."
                )
            except (OSError, ValueError):
                status.configure(
                    text="Não foi possível remover. Confira as permissões e a inicialização do Windows."
                )

    ttk.Button(frame, text="Ativar neste computador…", command=activate).pack(
        anchor="w", pady=5
    )
    ttk.Button(frame, text="Desativar neste computador…", command=deactivate).pack(
        anchor="w", pady=5
    )
    window.mainloop()
