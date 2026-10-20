"""Frozen backend entry point. The original projects are never executed."""

import argparse
import ctypes
import os
import threading

import uvicorn


def watch_parent(pid):
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
        os._exit(0)

    threading.Thread(target=wait, daemon=True).start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent", type=int, required=True)
    args = parser.parse_args()
    watch_parent(args.parent)
    # Import explicitly so PyInstaller discovers the complete dependency graph.
    from main import app

    uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False, log_level="warning")
