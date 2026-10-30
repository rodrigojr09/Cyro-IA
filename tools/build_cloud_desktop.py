"""Build installed Windows edition. Requires dependencies already installed; no publish."""

import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def run(args, cwd=ROOT):
    environment = dict(os.environ)
    # npm's Python checks must use the interpreter selected by build.bat as well.
    environment["PATH"] = (
        str(Path(sys.executable).parent) + os.pathsep + environment.get("PATH", "")
    )
    subprocess.run(args, cwd=cwd, check=True, env=environment)


def main():
    if os.name != "nt" or sys.maxsize <= 2**32:
        raise SystemExit("Build exige Windows x64.")
    origin = os.environ.get("CYRO_BACKEND_ORIGIN") or os.environ.get("JARVIS_CLOUD_ORIGIN") or json.loads((ROOT / "desktop/electron/backend-config.json").read_text())["origin"]
    parsed = urlparse(origin)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise SystemExit(
            "Defina JARVIS_CLOUD_ORIGIN com a origem HTTPS de produção. Nenhuma URL será inventada."
        )
    npm = shutil.which("npm.cmd")
    if not npm:
        raise SystemExit("Node/npm são necessários somente para compilar.")
    package = json.loads((ROOT / "desktop/package.json").read_text())
    root_package = json.loads((ROOT / "package.json").read_text())
    if package["version"] != root_package["version"]:
        raise SystemExit("Metadados divergentes.")
    run([npm, "run", "check:v6"])
    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onedir",
            "--console",
            "--name",
            "jarvis-backend",
            "--paths",
            str(ROOT / "backend"),
            "--distpath",
            str(ROOT / "build/v6/backend"),
            "--workpath",
            str(ROOT / "build/v6/work"),
            "--specpath",
            str(ROOT / "build/v6"),
            "--collect-submodules",
            "uvicorn",
            str(ROOT / "backend/cloud_entry.py"),
        ]
    )
    run([sys.executable, str(ROOT / "tools/build_icon.py")])
    target = ROOT / "desktop/electron/cloud-config.json"
    target.write_text(json.dumps({"origin": origin.rstrip("/")}), encoding="utf-8")
    run(
        [
            npm,
            "exec",
            "--",
            "electron-builder",
            "--config",
            "electron/builder.json",
            "--win",
            "--publish",
            "never",
        ],
        ROOT / "desktop",
    )
    run([sys.executable, str(ROOT / "tools/audit_cloud_artifact.py")])
    artifact = ROOT / "release/v6" / f"Cyro-IA-Setup-{package['version']}.exe"
    with artifact.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    artifact.with_suffix(".exe.sha256").write_text(
        f"{checksum}  {artifact.name}\n", encoding="utf-8"
    )
    print(
        "Instalador gerado e auditado; validar em Windows limpo e no Cloud real antes de release."
    )


if __name__ == "__main__":
    main()
