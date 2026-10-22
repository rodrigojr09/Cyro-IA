"""Run Cloud and Desktop together, owning only processes started by this launcher."""

import os
from pathlib import Path
import shutil
import signal
import socket
import sys
import time
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import start

ORIGIN = "http://localhost:3000"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


def cloud_port_busy():
    try:
        with socket.create_connection(("127.0.0.1", 3000), timeout=0.3):
            return True
    except OSError:
        return False


def wait_cloud(child, timeout=90):
    opener = build_opener(ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise start.LaunchError("O Cloud encerrou antes de iniciar. Confira as mensagens acima.")
        try:
            with opener.open(ORIGIN + "/login", timeout=2) as response:
                if response.status == 200 and child.poll() is None:
                    return
        except (OSError, URLError):
            pass
        time.sleep(0.25)
    raise start.LaunchError("O Cloud local não ficou pronto em 90 segundos.")


def desktop_environment():
    env = dict(os.environ)
    for key in list(env):
        if key in {"DATABASE_URL", "DIRECT_URL", "AUTH_SECRET"} or key.startswith(("OPENAI_", "BOOTSTRAP_")):
            env.pop(key)
    env["JARVIS_CLOUD_ORIGIN"] = ORIGIN
    env["JARVIS_CLOUD"] = "1"
    return env


def launch():
    lock = Path(start.tempfile.gettempdir()) / ("jarvis-local-" + start.INSTALLATION + ".lock")
    with start.InstanceLock(lock):
        node = shutil.which("node")
        candidates = [ROOT / "node_modules/next/dist/bin/next", ROOT / "cloud/node_modules/next/dist/bin/next"]
        next_cli = next((p for p in candidates if p.is_file()), None)
        if not node or not next_cli:
            raise start.LaunchError("Dependências Cloud ausentes. Instale Node e execute npm ci na raiz.")
        if not any((ROOT / name).is_file() for name in ["cloud/.env", "cloud/.env.local"]):
            raise start.LaunchError("Configure o Cloud privadamente em cloud/.env antes de iniciar.")
        if cloud_port_busy():
            raise start.LaunchError("A porta 3000 já está em uso. Feche o Cloud local anterior e tente novamente; nenhum serviço existente foi alterado.")
        owned = start.OwnedProcesses()
        try:
            cloud_env = dict(os.environ)
            cloud_env["APP_ORIGIN"] = ORIGIN
            start.say("Iniciando Cloud local em " + ORIGIN + " ...")
            cloud = owned.spawn([node, next_cli, "dev", "--hostname", "127.0.0.1", "--port", "3000"], ROOT / "cloud", env=cloud_env)
            wait_cloud(cloud)
            start.say("Cloud pronto. Abrindo JARVIS Desktop...")
            desktop = owned.spawn([sys.executable, "-u", ROOT / "tools/start_cloud.py"], ROOT, preserve_descendants=True, env=desktop_environment())
            while desktop.poll() is None:
                if cloud.poll() is not None:
                    raise start.LaunchError("O Cloud local encerrou. Encerrando o JARVIS iniciado aqui.")
                time.sleep(0.25)
            return desktop.returncode
        finally:
            start.say("Encerrando os serviços locais iniciados por este start.bat...")
            owned.close()


def main():
    if os.name == "nt":
        signal.signal(signal.SIGBREAK, lambda *_: signal.raise_signal(signal.SIGINT))
    try:
        return launch()
    except KeyboardInterrupt:
        start.say("Encerramento solicitado.")
        return 0
    except (start.LaunchError, OSError) as error:
        start.say(str(error) if isinstance(error, start.LaunchError) else "Falha ao iniciar os serviços locais. Confira permissões e dependências.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
