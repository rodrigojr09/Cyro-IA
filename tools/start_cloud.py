"""Start the existing local supervisor in Cloud mode, without using backend/.env."""

import os
from pathlib import Path
import runpy

os.environ["JARVIS_CLOUD"] = "1"
if not os.environ.get("JARVIS_CLOUD_ORIGIN"):
    raise SystemExit(
        "Configure JARVIS_CLOUD_ORIGIN (localhost em desenvolvimento, HTTPS em distribuição)."
    )
for key in list(os.environ):
    if key.startswith("OPENAI_"):
        os.environ.pop(key, None)
runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "start.py"), run_name="__main__"
)
