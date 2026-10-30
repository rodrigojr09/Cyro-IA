"""Start Desktop against an independently configured Backend; never owns remote services."""
import os
from pathlib import Path
import runpy
import json
import start

def desktop_environment():
    env=dict(os.environ)
    for key in list(env):
        if key in {"DATABASE_URL","DIRECT_URL","AUTH_SECRET","REDIS_URL","SERVICE_AUTH_SECRET","SERVICE_CONTEXT_SECRET","SIGNED_URL_SECRET","SERVICE_AUTH_PREVIOUS_SECRET"} or key.startswith(("OPENAI_","BOOTSTRAP_","SPOTIFY_","CYRO_FILES_","CYRO_GITHUB_","CYRO_PUBLISHER_","SERVICE_")):
            env.pop(key)
    if env.get("CYRO_BACKEND_ORIGIN"): env["JARVIS_CLOUD_ORIGIN"]=env["CYRO_BACKEND_ORIGIN"]
    if not env.get("JARVIS_CLOUD_ORIGIN"): env["JARVIS_CLOUD_ORIGIN"]=json.loads((Path(__file__).resolve().parents[1] / "desktop/electron/backend-config.json").read_text())["origin"]
    env["JARVIS_CLOUD"]="1"
    return env

def launch():
    env=desktop_environment()
    if not env.get("JARVIS_CLOUD_ORIGIN"):
        raise start.LaunchError("Configure JARVIS_CLOUD_ORIGIN com a API do Cyro Backend; inicie Backend e Cloud em seus próprios projetos.")
    # Environment sanitization affects only this launcher/children, no other process.
    os.environ.clear()
    os.environ.update(env)
    runpy.run_path(str(Path(__file__).resolve().parent / "start_cloud.py"),run_name="__main__")
    return 0

def main():
    try:return launch()
    except start.LaunchError as error:
        start.say(str(error));return 1

if __name__=="__main__":raise SystemExit(main())
