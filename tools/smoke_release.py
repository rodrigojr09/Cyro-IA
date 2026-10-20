"""Exercise the real portable with isolated memory, no OpenAI calls or desktop automation."""

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

import psutil

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
    with OPENER.open(req, timeout=2) as response:
        return json.load(response)


def main():
    if "--interactive-unlock" not in sys.argv:
        raise RuntimeError(
            "O cofre exige interação humana. Execute com --interactive-unlock e use uma chave fictícia sk- com pelo menos 20 caracteres; não teste conexão. Este smoke não envia mensagens à OpenAI."
        )
    version = json.loads((ROOT / "desktop/package.json").read_text())["version"]
    exe = ROOT / "release" / f"JARVIS-{version}-x64.exe"
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", 8765)) == 0:
            raise RuntimeError(
                "Porta 8765 ocupada; nenhum processo externo será encerrado."
            )
    expected = hashlib.sha256(str(exe.resolve()).lower().encode()).hexdigest()
    with tempfile.TemporaryDirectory(prefix="jarvis-release-") as temporary:
        os.environ["JARVIS_DATA_DIR"] = temporary
        os.environ["OPENAI_API_KEY"] = ""
        os.environ.pop("ELECTRON_RUN_AS_NODE", None)
        chat_id = None
        for cycle in range(2):
            owner = OwnedProcesses()
            try:
                launcher = owner.spawn([exe], exe.parent)
                print(
                    "Na janela do JARVIS, configure/desbloqueie o cofre de teste temporário. Não use sua chave real."
                )
                for _ in range(1200):
                    try:
                        health = request("/health")
                        if (
                            health.get("version") == version
                            and health.get("installation") == expected
                        ):
                            break
                    except (OSError, URLError):
                        pass
                    if launcher.poll() is not None:
                        raise RuntimeError(
                            "O portátil encerrou antes de disponibilizar o backend."
                        )
                    time.sleep(0.5)
                else:
                    raise RuntimeError("Timeout do portátil.")
                token = (Path(temporary) / ".local-token").read_text().strip()
                try:
                    request("/workspace")
                    raise AssertionError("Rota de dados sem autenticação.")
                except HTTPError as error:
                    assert error.code == 401
                workspace = request("/workspace", token)
                assert workspace["projects"] == []
                if cycle == 0:
                    chat = request(
                        "/chats/create", token, {"title": "Teste portátil isolado"}
                    )
                    chat_id = chat["id"]
                else:
                    assert any(chat["id"] == chat_id for chat in workspace["chats"])
                history = request("/chats/history?chat_id=" + chat_id, token)
                assert history["chat"]["id"] == chat_id
                children = psutil.Process(launcher.pid).children(recursive=True)
                backend = next(
                    child
                    for child in children
                    if child.name().lower() == "jarvis-backend.exe"
                )
                parent = backend.parent()
                assert parent is not None and parent.name().lower() == "jarvis.exe"
                # Kill only this fixture's actual Electron, then check the backend's parent monitor.
                parent.terminate()
                parent.wait(10)
                backend.wait(30)
                print(
                    f"Portátil: ciclo {cycle + 1}, saúde, autenticação, chats e monitor do pai aprovados."
                )
            finally:
                owner.close()
            time.sleep(1)
    print(
        "Portátil reiniciado com memória persistente isolada; nenhuma chamada à OpenAI."
    )


if __name__ == "__main__":
    main()
