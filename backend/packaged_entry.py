"""Frozen backend entry point. The original projects are never executed."""

import argparse
import ctypes
import os
import threading

import uvicorn


def watch_parent(pid, shutdown):
    """Keep a handle to the actual parent, avoiding PID reuse and orphan servers."""
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.OpenProcess(0x00100000, False, pid)
    if not handle:
        raise RuntimeError("Processo principal indisponível.")

    def wait():
        kernel.WaitForSingleObject(handle, 0xFFFFFFFF)
        kernel.CloseHandle(handle)
        shutdown()
        # Parent loss must not leave an orphan, even if a library is blocked.
        threading.Event().wait(20)
        os._exit(1)

    threading.Thread(target=wait, daemon=True).start()


if __name__ == "__main__":
    # Never reuse a developer/host key or provider override in the portable edition.
    for variable in [
        "OPENAI_API_KEY",
        "OPENAI_LOG",
        "OPENAI_BASE_URL",
        "OPENAI_ORG_ID",
        "OPENAI_PROJECT_ID",
    ]:
        os.environ.pop(variable, None)
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent", type=int)
    parser.add_argument("--configure", action="store_true")
    parser.add_argument("--backups", action="store_true")
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--recover-data", action="store_true")
    parser.add_argument("--migrate", action="store_true")
    parser.add_argument("--startup", action="store_true")
    parser.add_argument("--fixture-check", action="store_true")
    args = parser.parse_args()
    if args.fixture_check:
        from runtime_fixture import run

        run()
        raise SystemExit(0)
    if args.self_check:
        import tkinter
        import sqlite3
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from openai import AsyncOpenAI

        print(
            "JARVIS runtime: Python, SQLite, interface nativa e criptografia disponíveis."
        )
        raise SystemExit(0)
    from data_paths import data_directory
    from credential_dialog import credentials
    from portable_backup import recover_restore

    recover_restore(data_directory())
    from guided_migration import recover, wizard

    recover(data_directory())
    if args.recover_data:
        raise SystemExit(0)
    if args.startup:
        from authorized_startup import settings_dialog
        from pathlib import Path
        import sys

        settings_dialog(
            data_directory().parent,
            Path(sys.executable).parent.parent / "startup/JARVIS Device Watcher.exe",
        )
        raise SystemExit(0)

    if args.backups:
        from backup_dialog import backup_dialog

        bundle = credentials(data_directory(), return_bundle=True)
        if not bundle:
            raise SystemExit(1)
        import protected_storage

        protected_storage.configure(data_directory(), bundle["data_key"])
        backup_dialog(data_directory())
        raise SystemExit(0)

    if args.configure:
        raise SystemExit(0 if credentials(data_directory(), configure=True) else 1)
    if args.migrate:
        bundle = credentials(data_directory(), return_bundle=True)
        if not bundle:
            raise SystemExit(1)
        import protected_storage

        protected_storage.configure(data_directory(), bundle["data_key"])
        raise SystemExit(
            0 if wizard(data_directory(), bundle["data_key"], force=True) else 1
        )
    if args.parent is None:
        parser.error("--parent obrigatório")
    server = uvicorn.Server(
        uvicorn.Config(
            "main:app",
            host="127.0.0.1",
            port=8765,
            access_log=False,
            log_level="warning",
        )
    )

    def shutdown():
        server.should_exit = True

    watch_parent(args.parent, shutdown)

    def watch_input():
        import sys

        for line in sys.stdin:
            if line.strip() == "shutdown":
                shutdown()
                return
        shutdown()

    threading.Thread(target=watch_input, daemon=True).start()
    bundle = credentials(data_directory(), return_bundle=True)
    if not bundle:
        raise SystemExit(1)
    import runtime_credentials

    runtime_credentials.API_KEY = bundle["api_key"]
    import protected_storage

    protected_storage.configure(data_directory(), bundle["data_key"])
    if not wizard(data_directory(), bundle["data_key"]):
        raise SystemExit(1)
    del bundle
    # Import explicitly so PyInstaller discovers the complete dependency graph.
    from main import app

    if not server.should_exit:
        server.config.app = app
        server.run()
