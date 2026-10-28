"""Inspect the actual ASAR and loose runtime; no private values printed."""

import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]


def audit():
    builder = json.loads((ROOT / "desktop/electron/builder.json").read_text())
    payload = (
        ROOT / "desktop" / builder["directories"]["output"]
    ).resolve() / "win-unpacked"
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
        if "quick-spotify.js" in entries:
            raise RuntimeError("Mini player antigo ainda presente no pacote.")
        for name in entries:
            if (
                name.startswith("Backup/")
                or name.split("/")[-1].startswith(".env")
                or name.endswith((".db", ".sqlite", ".sqlite3", ".key", ".pfx"))
            ):
                raise RuntimeError("Arquivo privado/proibido no ASAR.")
        expected = json.loads((ROOT / "desktop/electron/runtime-files.json").read_text(encoding="utf-8"))
        if any(name.startswith("tests/") or name.endswith((".jsx", ".tsx", ".test.js")) for name in entries):
            raise RuntimeError("Fontes de desenvolvimento ou testes presentes no pacote.")
        expected.extend(p.relative_to(ROOT / "desktop").as_posix() for p in (ROOT / "desktop/styles").glob("*.css"))
        for name in expected:
            item = header
            for part in name.split("/"):
                item = item["files"][part]
            stream.seek(offset + int(item["offset"]))
            packaged = stream.read(item["size"])
            source = (ROOT / "desktop" / name).read_bytes()
            if name == "package.json":
                installed, current = json.loads(packaged), json.loads(source)
                if any(
                    installed.get(key) != current.get(key)
                    for key in ("version", "author", "homepage")
                ):
                    raise RuntimeError(
                        "Payload contém versão ou autoria desatualizada."
                    )
            elif packaged != source:
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
