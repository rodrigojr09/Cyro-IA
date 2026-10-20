"""Inspect the actual ASAR and loose runtime; no private values printed."""

import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]


def audit():
    payload = ROOT / "release/v3/win-unpacked"
    archive = payload / "resources/app.asar"
    with archive.open("rb") as stream:
        fields = struct.unpack("<4I", stream.read(16))
        header = json.loads(stream.read(fields[3]))
        offset = 8 + fields[1]

        def names(item, prefix=""):
            for name, child in item.get("files", {}).items():
                relative = prefix + name
                if "files" in child:
                    yield from names(child, relative + "/")
                else:
                    yield relative

        entries = list(names(header))
        for name in entries:
            if (
                name.startswith("Backup/")
                or name.split("/")[-1].startswith(".env")
                or name.endswith((".db", ".sqlite", ".sqlite3", ".key", ".pfx"))
            ):
                raise RuntimeError("Arquivo privado/proibido no ASAR.")
        for name in [
            "main.js",
            "preload.js",
            "renderer.js",
            "index.html",
            "electron/main.cjs",
            "voice-input.js",
            "services/cloud.js",
            "services/local-stream.js",
            "activation.html",
        ]:
            item = header
            for part in name.split("/"):
                item = item["files"][part]
            stream.seek(offset + int(item["offset"]))
            if stream.read(item["size"]) != (ROOT / "desktop" / name).read_bytes():
                raise RuntimeError("Payload contém código desatualizado.")
    for file in payload.rglob("*"):
        if not file.is_file():
            continue
        if (
            file.relative_to(payload).as_posix()
            == "resources/backend/_internal/certifi/cacert.pem"
        ):
            continue
        if file.name.startswith(".env") or file.suffix.lower() in {
            ".db",
            ".sqlite",
            ".sqlite3",
            ".key",
            ".pfx",
            ".p12",
            ".pem",
        }:
            raise RuntimeError("Arquivo privado inesperado no runtime.")
    print(
        "Payload auditado: fontes atuais, ASAR e runtime sem arquivos privados proibidos."
    )


if __name__ == "__main__":
    audit()
