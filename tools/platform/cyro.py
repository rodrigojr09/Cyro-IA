"""Cyro multi-repository development tooling. Never deploys or mutates production."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

PROJECTS = ("cyro-backend", "cyro-cloud", "cyro-desktop", "cyro-files")
RUNTIME_KEYS = {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOME", "LOCALAPPDATA", "APPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "SYSTEMDRIVE"}

def workspace(value=None):
    root = Path(value).resolve() if value else Path(__file__).resolve().parents[3]
    if not all((root / p / "package.json").is_file() for p in PROJECTS):
        raise ValueError("Selecione a pasta que contém os quatro projetos Cyro.")
    return root

def runtime_environment(extra=None):
    # Start from an allowlist: UI processes never inherit arbitrary server secrets.
    result = {k: v for k, v in os.environ.items() if k.upper() in RUNTIME_KEYS}
    result.update(extra or {})
    return result

def read_env(path):
    result = {}
    for raw in Path(path).read_text(encoding="utf-8-sig").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"): continue
        key, separator, value = raw.partition("=")
        if not separator: raise ValueError("Arquivo de ambiente inválido.")
        result[key.strip()] = value.strip().strip("\"'")
    return result

def npm():
    executable = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not executable: raise ValueError("Instale Node.js 24 LTS e npm.")
    return executable

def node24():
    node = os.environ.get("CYRO_NODE") or shutil.which("node")
    if not node: raise ValueError("Instale Node.js 24 LTS.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if version.split(".")[0] != "v24":
        raise ValueError("O ambiente conjunto requer Node.js 24 LTS. Selecione a versão indicada em .nvmrc; nenhuma instalação global foi alterada.")
    return node

def run(args, cwd, env=None):
    child_env=runtime_environment(env)
    child_env["PATH"]=str(Path(node24()).parent)+os.pathsep+child_env.get("PATH", "")
    subprocess.run([str(a) for a in args], cwd=cwd, env=child_env, check=True)

def contracts(root):
    b = json.loads((root/"cyro-backend/contracts/api-routes.json").read_text(encoding="utf-8"))
    c = json.loads((root/"cyro-cloud/contracts/api-routes.json").read_text(encoding="utf-8"))
    if b != c: raise ValueError("Contratos Backend/Cloud divergentes.")
    protocol = (root/"cyro-desktop/desktop/scripts/updates/protocol.js").read_text(encoding="utf-8")
    for name in ("cyro-backend", "cyro-cloud"):
        if (root/name/"contracts/updates/protocol.cjs").read_text(encoding="utf-8") != protocol: raise ValueError("Protocolo do atualizador divergente.")
    print("Contratos e protocolo dos três clientes/serviços sincronizados.")

def main():
    parser = argparse.ArgumentParser(description="Organização dos quatro repositórios Cyro; sem deploy ou migrations automáticas")
    parser.add_argument("command", choices=["inventory", "install", "contracts", "test-integration", "doctor", "production-check", "audit"])
    parser.add_argument("--root")
    parser.add_argument("--api-origin")
    parser.add_argument("--cloud-origin")
    parser.add_argument("--backend-env")
    parser.add_argument("--files-env")
    parser.add_argument("--cloud-env")
    args = parser.parse_args()
    root = workspace(args.root)
    if args.command == "inventory":
        for name in PROJECTS:
            package = json.loads((root/name/"package.json").read_text(encoding="utf-8"))
            print(f"{name}: {package['version']}")
    elif args.command == "install":
        node24()
        for name in PROJECTS: run([npm(), "ci"], root/name)
        run([npm(), "ci"], root/"cyro-desktop/tools/platform/integration")
    elif args.command == "contracts": contracts(root)
    elif args.command == "test-integration": run([npm(), "test"], root/"cyro-desktop/tools/platform/integration", {"CYRO_WORKSPACE_ROOT": str(root)})
    elif args.command == "doctor":
        from production import check_origin, probe
        if not args.api_origin and not args.cloud_origin: raise ValueError("Informe --api-origin e/ou --cloud-origin com as origens públicas HTTPS reais.")
        for origin, service in [(args.api_origin,"cyro-backend"),(args.cloud_origin,"cyro-cloud")]:
            if origin: check_origin(origin); probe(origin, service); print(f"{service}: saúde HTTP confirmada.")
    elif args.command == "audit":
        import security_audit
        previous=sys.argv
        try:sys.argv=[previous[0]];security_audit.main()
        finally:sys.argv=previous
    elif args.command == "production-check":
        from production import validate
        if not all([args.backend_env,args.files_env,args.cloud_env]): raise ValueError("Informe os três arquivos de configuração privados com --backend-env, --files-env e --cloud-env.")
        issues=validate(read_env(args.backend_env),read_env(args.files_env),read_env(args.cloud_env))
        if issues: raise ValueError("Configuração requer ajustes:\n"+"\n".join("- "+i for i in issues))
        print("Configuração coerente: origens, chaves entre serviços, aplicações e isolamento. Nenhum segredo exibido; nenhum serviço ou dado alterado.")

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: print("Execução encerrada.")
    except (ValueError, subprocess.CalledProcessError, OSError) as error:
        print(str(error) if isinstance(error, ValueError) else "A operação falhou; nenhum deploy foi executado.", file=sys.stderr)
        raise SystemExit(1)
