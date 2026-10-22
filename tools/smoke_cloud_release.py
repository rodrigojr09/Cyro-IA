"""Boot the real installed payload twice with private temporary data and restricted PATH.

This is not certification on a clean Windows VM. Never sends paid API calls.
"""

import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import build_opener, ProxyHandler, Request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from start import OwnedProcesses

OPENER = build_opener(ProxyHandler({}))


def request(route, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Jarvis-Token"] = token
    req = Request(
        "http://127.0.0.1:8765" + route,
        headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
    )
    with OPENER.open(req, timeout=3) as response:
        return json.load(response)


def main():
    exe = ROOT / "release/v4/win-unpacked/JARVIS.exe"
    if not exe.is_file():
        raise RuntimeError("Gere o payload NSIS antes do smoke.")
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", 8765)) == 0:
            raise RuntimeError("Porta ocupada; nenhum processo externo será encerrado.")
    version = json.loads((ROOT / "package.json").read_text())["version"]
    expected = hashlib.sha256(str(exe.resolve()).lower().encode()).hexdigest()
    previous_env = dict(os.environ)
    with tempfile.TemporaryDirectory(prefix="jarvis-cloud-runtime-") as temporary:
        try:
            os.environ["JARVIS_DATA_DIR"] = temporary
            os.environ["PATH"] = str(Path(os.environ["SystemRoot"]) / "System32")
            os.environ.pop("ELECTRON_RUN_AS_NODE", None)
            for name in list(os.environ):
                if name.startswith("OPENAI_"):
                    os.environ.pop(name, None)
            chat_id = None
            for cycle in range(2):
                owner = OwnedProcesses()
                try:
                    process = owner.spawn([exe], exe.parent)
                    for _ in range(120):
                        try:
                            health = request("/health")
                            if (
                                health.get("version") == version
                                and health.get("installation") == expected
                            ):
                                break
                        except (OSError, URLError):
                            pass
                        if process.poll() is not None:
                            raise RuntimeError(
                                "Aplicativo encerrou antes de iniciar o serviço local."
                            )
                        time.sleep(0.5)
                    else:
                        raise RuntimeError("Serviço local não iniciou.")
                    token = (Path(temporary) / ".local-token").read_text().strip()
                    try:
                        request("/workspace")
                        raise AssertionError("API local sem autenticação.")
                    except HTTPError as error:
                        assert error.code == 401
                    workspace = request("/workspace", token)
                    if cycle == 0:
                        chat_id = request(
                            "/chats/create", token, {"title": "Smoke Cloud privado"}
                        )["id"]
                    else:
                        assert any(chat["id"] == chat_id for chat in workspace["chats"])
                finally:
                    owner.close()
                for _ in range(100):
                    try:
                        request("/health")
                    except (OSError, URLError):
                        break
                    time.sleep(0.1)
            print(
                "Payload real: inicialização sem Python/Node no PATH, autenticação local e persistência após reinício OK. Sem API paga; não equivale a Windows limpo."
            )
        finally:
            os.environ.clear()
            os.environ.update(previous_env)


if __name__ == "__main__":
    main()
