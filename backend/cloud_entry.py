"""Windows local service for the installed Cloud edition; no portable/key dialogs."""

import argparse
import os
import threading
import sys
import uvicorn
from packaged_entry import watch_parent

if __name__ == "__main__":
    os.environ["JARVIS_CLOUD"] = "1"
    for key in list(os.environ):
        if key.startswith(("OPENAI_", "SPOTIFY_")):
            os.environ.pop(key, None)
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent", type=int)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        import sqlite3
        import cloud_client
        import project_store
        import programming.security
        import io
        from PIL import Image
        from pypdf import PdfReader, PdfWriter
        from attachments import image_bytes, document_text

        source = io.BytesIO()
        Image.new("RGB", (4, 4), "green").save(source, "PNG")
        assert image_bytes(source.getvalue()).startswith(b"\xff\xd8")
        assert "Anexo" in document_text(b"Anexo de teste", ".txt")[0]
        pdf = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.write(pdf)
        assert len(PdfReader(io.BytesIO(pdf.getvalue())).pages) == 1

        with sqlite3.connect(":memory:") as connection:
            assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        print(
            "JARVIS Cloud local runtime: FastAPI, SQLite, OpenAI adapter, local images/PDF and read policy OK."
        )
        raise SystemExit(0)
    if args.parent is None:
        parser.error("--parent obrigatório")
    from data_paths import data_directory

    data_directory()  # Absolute path provided by Electron is mandatory when frozen.
    from main import app

    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=8765, access_log=False, log_level="warning"
        )
    )

    def stop():
        server.should_exit = True

    watch_parent(args.parent, stop)

    def watch_input():
        for line in sys.stdin:
            if line.strip() == "shutdown":
                break
        stop()

    threading.Thread(target=watch_input, daemon=True).start()
    server.run()
