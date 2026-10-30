"""Recreate public workspace entry points, without creating a Git repository."""
from pathlib import Path
root=Path(__file__).resolve().parents[3]
if not all((root/name/"package.json").is_file() for name in ("cyro-backend","cyro-cloud","cyro-desktop","cyro-files")):
    raise SystemExit("Coloque os quatro repositórios na mesma pasta antes de criar os atalhos.")
(root/"cyro.py").write_text('from pathlib import Path\nimport runpy\nrunpy.run_path(str(Path(__file__).resolve().parent / "cyro-desktop/tools/platform/cyro.py"), run_name="__main__")\n',encoding="utf-8")
(root/"cyro.bat").write_text('@echo off\ncd /d "%~dp0"\npython cyro.py %*\n',encoding="utf-8")
(root/"README.md").write_bytes((root/"cyro-desktop/docs/v7/WORKSPACE.md").read_bytes())
(root/".nvmrc").write_text("24\n",encoding="utf-8")
ignore=root/".gitignore"
content=ignore.read_text(encoding="utf-8") if ignore.exists() else ""
if ".cyro/" not in content:ignore.write_text(content+"\n.cyro/\n__pycache__/\n.env\n.env.*\n!.env.example\n",encoding="utf-8")
print("Atalhos e índice da plataforma preparados; nenhum repositório Git foi criado ou alterado.")
