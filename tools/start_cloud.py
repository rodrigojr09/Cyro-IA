"""Start the existing local supervisor in Cloud mode, without using backend/.env."""

import os
from pathlib import Path
import runpy
import json

os.environ["JARVIS_CLOUD"] = "1"
if os.environ.get("CYRO_BACKEND_ORIGIN"):
    os.environ["JARVIS_CLOUD_ORIGIN"] = os.environ["CYRO_BACKEND_ORIGIN"]
if not os.environ.get("JARVIS_CLOUD_ORIGIN"):
    os.environ["JARVIS_CLOUD_ORIGIN"] = json.loads((Path(__file__).resolve().parents[1] / "desktop/electron/backend-config.json").read_text())["origin"]
if not os.environ.get("JARVIS_CLOUD_ORIGIN"):
    raise SystemExit(
        "Configure JARVIS_CLOUD_ORIGIN (localhost em desenvolvimento, HTTPS em distribuição)."
    )
for key in list(os.environ):
    if key in {"DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "REDIS_URL", "SERVICE_AUTH_SECRET", "SERVICE_CONTEXT_SECRET","SIGNED_URL_SECRET","SERVICE_AUTH_PREVIOUS_SECRET"} or key.startswith(("OPENAI_", "SPOTIFY_", "BOOTSTRAP_", "CYRO_FILES_", "CYRO_GITHUB_", "CYRO_PUBLISHER_","SERVICE_")):
        os.environ.pop(key, None)
runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "start.py"), run_name="__main__"
)
