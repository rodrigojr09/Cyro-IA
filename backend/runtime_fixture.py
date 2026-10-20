"""Frozen runtime diagnostic: owns a temporary profile, never accepts a user path."""

import os
from pathlib import Path
import sys
import tempfile


def run():
    if not getattr(sys, "frozen", False):
        raise RuntimeError("Execute este diagnóstico somente no backend compilado.")
    from fastapi.testclient import TestClient
    from secure_vault import save_key, load_bundle
    import protected_storage as storage
    import runtime_credentials

    with tempfile.TemporaryDirectory(prefix="jarvis-runtime-fixture-") as folder:
        data = Path(folder) / "data"
        vault = data / "config/credentials.vault"
        save_key(
            vault, "sk-fixture-not-a-real-key-123456789", "runtime fixture password"
        )
        key = load_bundle(vault, "runtime fixture password")["data_key"]
        storage.configure(data, key)
        storage.write_text(data / "config/settings.json", '{"backup_retention":2}')
        os.environ["JARVIS_DATA_DIR"] = str(data)
        os.environ["JARVIS_PORTABLE"] = "1"
        runtime_credentials.API_KEY = "sk-fixture-not-a-real-key-123456789"
        import main

        chat_id = None
        for cycle in range(2):
            with TestClient(main.app) as client:
                assert client.get("/health").status_code == 200
                assert client.get("/workspace").status_code == 401
                headers = {"X-Jarvis-Token": main.SESSION_TOKEN}
                if chat_id is None:
                    response = client.post(
                        "/chats/create",
                        json={"title": "PRIVATE_FIXTURE_TITLE"},
                        headers=headers,
                    )
                    assert response.status_code == 200
                    chat_id = response.json()["id"]
                    main.store.append(chat_id, "user", "PRIVATE_FIXTURE_MESSAGE")
                history = client.get(
                    "/chats/history", params={"chat_id": chat_id}, headers=headers
                )
                assert history.status_code == 200
                assert (
                    history.json()["messages"][0]["content"]
                    == "PRIVATE_FIXTURE_MESSAGE"
                )
            assert not (data / ".local-token").exists()
        for path in Path(folder).rglob("*"):
            if path.is_file():
                raw = path.read_bytes()
                assert b"PRIVATE_FIXTURE_MESSAGE" not in raw
                assert not raw.startswith(b"SQLite format 3")
        backups = list((Path(folder) / "backups").glob("*.jbackup"))
        assert backups
        from portable_backup import restore_backup

        restore_backup(
            backups[-1], data, confirmed=True, password="runtime fixture password"
        )
        storage.configure()
    print(
        "Runtime isolado: FastAPI, autenticacao, SQLite criptografado, persistencia em dois ciclos, backup e restauracao aprovados. Sem API externa."
    )
