"""Writer tables live in the existing project SQLite, never the user's source tree."""

import hashlib
import zlib
import base64
import json
import uuid
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone, timedelta
from project_store import database, identifier, now
from programming.security import ReadError
from writer_models import (
    Block,
    Operation,
    WriterSettings,
    MAX_DOCUMENT_BYTES,
    MAX_WRITER_BYTES,
    MAX_NODES,
)


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def snapshot(value):
    raw = dump(value)
    return (
        "z:" + base64.b64encode(zlib.compress(raw.encode(), 6)).decode()
        if len(raw) > 2048
        else raw
    )


def read_snapshot(value):
    if not value:
        return None
    if value.startswith("z:"):
        decoder = zlib.decompressobj()
        raw = decoder.decompress(
            base64.b64decode(value[2:]), 2 * MAX_DOCUMENT_BYTES + 100000
        )
        if decoder.unconsumed_tail or not decoder.eof:
            raise ReadError("Revisão inválida ou acima do limite.")
        return json.loads(raw)
    return json.loads(value)


def uid():
    return str(uuid.uuid4())


def title(value):
    value = value.strip()
    if (
        not value
        or len(value) > 120
        or any(ord(c) < 32 or c in '/\\:*?"<>|' for c in value)
        or value in {".", ".."}
    ):
        raise ReadError(
            "Informe um nome simples, sem caminhos ou caracteres reservados."
        )
    return value


def blocks(value):
    result = [
        Block.model_validate(b).model_dump() if isinstance(b, dict) else b.model_dump()
        for b in value
    ]
    if (
        len({b["id"] for b in result}) != len(result)
        or len(dump(result).encode()) > MAX_DOCUMENT_BYTES
    ):
        raise ReadError(
            "Documento duplicado ou acima de 512 KB. Divida-o em capítulos."
        )
    return result


class WriterConflict(ReadError):
    pass


class WriterStore:
    def __init__(self, store, project_id):
        self.store, self.project_id = store, identifier(project_id)
        self.project = store.project(self.project_id)
        self.path = store.db_path(self.project_id)
        with database(self.path) as con:
            con.executescript("""
            CREATE TABLE IF NOT EXISTS writer_nodes(id TEXT PRIMARY KEY,parent TEXT,title TEXT NOT NULL,kind TEXT NOT NULL,
              position INTEGER NOT NULL,version INTEGER NOT NULL,blocks TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS writer_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,batch TEXT NOT NULL,node TEXT NOT NULL,
              version INTEGER NOT NULL,before TEXT,after TEXT NOT NULL,source TEXT NOT NULL,operation TEXT NOT NULL,original TEXT NOT NULL,
              reference TEXT,important INTEGER NOT NULL,created TEXT NOT NULL, UNIQUE(node,version));
            CREATE TABLE IF NOT EXISTS writer_proposals(id TEXT PRIMARY KEY,node TEXT,base INTEGER NOT NULL,plan TEXT NOT NULL,
              versions TEXT NOT NULL,tree_hash TEXT,intent TEXT NOT NULL,instruction TEXT NOT NULL,original TEXT NOT NULL,
              state TEXT NOT NULL,auto INTEGER NOT NULL,created TEXT NOT NULL,expires TEXT NOT NULL,result_version INTEGER,result_node TEXT);
            CREATE TABLE IF NOT EXISTS writer_messages(id TEXT PRIMARY KEY,node TEXT,role TEXT NOT NULL,content TEXT NOT NULL,
              intent TEXT,proposal TEXT,created TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS writer_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS writer_requests(id TEXT PRIMARY KEY,result TEXT NOT NULL);
            """)
            if "result_node" not in {
                r[1] for r in con.execute("PRAGMA table_info(writer_proposals)")
            }:
                con.execute("ALTER TABLE writer_proposals ADD COLUMN result_node TEXT")

    def bind_chat(self, document_id):
        node = self.get(document_id)
        if node["kind"] == "folder" or node["deleted"]:
            raise ReadError("Escolha um documento ativo.")
        with database(self.store.registry) as con:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute(
                "SELECT * FROM chats WHERE project_id=? AND writer_document_id=?",
                (self.project_id, node["id"]),
            ).fetchone()
            if row:
                result = dict(row)
            else:
                chat_id = uid()
                con.execute(
                    "INSERT INTO chats(id,project_id,title,created_at,writer_document_id) VALUES(?,?,?,?,?)",
                    (chat_id, self.project_id, node["title"], now(), node["id"]),
                )
                result = dict(
                    con.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
                )
        self.store.mirror_chat(result)
        return result

    @contextmanager
    def transaction(self):
        with database(self.path) as con:
            con.execute("BEGIN IMMEDIATE")
            yield con
            self.validate_tree(con)
            self.budget(con)

    def validate_tree(self, con):
        nodes = {n["id"]: n for n in self.tree(con)}
        for node in nodes.values():
            if node["deleted"]:
                continue
            parent = node["parent"]
            seen = {node["id"]}
            while parent:
                if parent in seen or parent not in nodes or nodes[parent]["deleted"]:
                    raise WriterConflict(
                        "A recuperação criaria uma estrutura inválida. Recupere primeiro a pasta ou revise a organização atual."
                    )
                seen.add(parent)
                parent = nodes[parent]["parent"]

    def budget(self, con):
        total = 0
        for table, expression in [
            (
                "writer_nodes",
                "length(CAST(blocks AS BLOB))+length(CAST(title AS BLOB))",
            ),
            (
                "writer_revisions",
                "length(CAST(coalesce(before,'')||after||original AS BLOB))",
            ),
            ("writer_proposals", "length(CAST(plan||original||instruction AS BLOB))"),
            ("writer_messages", "length(CAST(content AS BLOB))"),
            ("writer_requests", "length(CAST(result AS BLOB))"),
        ]:
            total += con.execute(
                f"SELECT coalesce(sum({expression}),0) FROM {table}"
            ).fetchone()[0]
        if total > MAX_WRITER_BYTES:
            raise ReadError(
                "O Writer deste projeto atingiu 5 MB, incluindo histórico. Exporte e revise a retenção antes de continuar."
            )

    def settings(self, con=None):
        if con is None:
            with database(self.path) as db:
                return self.settings(db)
        row = con.execute("SELECT data FROM writer_settings WHERE id=1").fetchone()
        return (
            WriterSettings.model_validate_json(row[0]).model_dump()
            if row
            else WriterSettings().model_dump()
        )

    def configure(self, value):
        config = WriterSettings.model_validate(
            {**self.settings(), **value}
        ).model_dump()
        with self.transaction() as con:
            con.execute(
                "INSERT OR REPLACE INTO writer_settings VALUES(1,?)", (dump(config),)
            )
        return config

    def node(self, con, node_id, deleted=False):
        row = con.execute(
            "SELECT * FROM writer_nodes WHERE id=?", (identifier(node_id),)
        ).fetchone()
        if row is None or (row["deleted"] and not deleted):
            raise ReadError("Documento não pertence a este projeto ou foi removido.")
        result = dict(row)
        result["blocks"] = json.loads(result["blocks"])
        return result

    def get(self, node_id, include_removed=False):
        with database(self.path) as con:
            return self.node(con, node_id, include_removed)

    def tree(self, con):
        return [
            dict(r)
            for r in con.execute(
                "SELECT id,parent,title,kind,position,version,deleted,updated FROM writer_nodes ORDER BY position,updated,id"
            )
        ]

    def tree_hash(self, con):
        return hashlib.sha256(dump(self.tree(con)).encode()).hexdigest()

    def open(self):
        with database(self.path) as con:
            return {
                "project_id": self.project_id,
                "settings": self.settings(con),
                "nodes": self.tree(con),
                "limit_bytes": MAX_WRITER_BYTES,
            }

    def record(
        self,
        con,
        before,
        after,
        source,
        operation,
        original="",
        reference=None,
        batch=None,
    ):
        after = {
            **after,
            "blocks": blocks(after["blocks"]),
            "title": title(after["title"]),
            "updated": now(),
        }
        if before:
            after["version"] = before["version"] + 1
        con.execute(
            "INSERT OR REPLACE INTO writer_nodes VALUES(?,?,?,?,?,?,?,?,?)",
            (
                after["id"],
                after["parent"],
                after["title"],
                after["kind"],
                after["position"],
                after["version"],
                dump(after["blocks"]),
                after["deleted"],
                after["updated"],
            ),
        )
        con.execute(
            "INSERT INTO writer_revisions(batch,node,version,before,after,source,operation,original,reference,important,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (
                batch or uid(),
                after["id"],
                after["version"],
                snapshot(before) if before else None,
                snapshot(after),
                source,
                operation,
                original,
                reference,
                int(source != "manual" or operation != "save"),
                now(),
            ),
        )
        return after

    def create_in(
        self, con, name, kind="document", parent=None, batch=None, source="manual"
    ):
        if con.execute("SELECT count(*) FROM writer_nodes").fetchone()[0] >= MAX_NODES:
            raise ReadError(
                "Limite de 200 itens por projeto, incluindo itens recuperáveis."
            )
        if parent:
            self.node(con, parent)
        position = con.execute(
            "SELECT coalesce(max(position),0)+1 FROM writer_nodes WHERE parent IS ?",
            (parent,),
        ).fetchone()[0]
        return self.record(
            con,
            None,
            {
                "id": uid(),
                "parent": parent,
                "title": name,
                "kind": kind,
                "position": position,
                "version": 1,
                "blocks": [],
                "deleted": 0,
            },
            source,
            "create",
            batch=batch,
        )

    def create(self, name, kind="document", parent=None):
        with self.transaction() as con:
            return self.create_in(con, title(name), kind, parent)

    def check_version(self, node, version):
        if node["version"] != version:
            raise WriterConflict(
                "O documento mudou. Sua edição foi preservada; compare com a versão salva antes de tentar novamente."
            )

    def save(self, req):
        request_id = identifier(req.request_id)
        with self.transaction() as con:
            old = con.execute(
                "SELECT result FROM writer_requests WHERE id=?", (request_id,)
            ).fetchone()
            if old:
                return json.loads(old[0])
            node = self.node(con, req.id)
            self.check_version(node, req.base_version)
            if node["kind"] == "folder":
                raise ReadError("Pastas não recebem texto.")
            updated = self.record(
                con, node, {**node, "blocks": blocks(req.blocks)}, "manual", "save"
            )
            con.execute(
                "INSERT INTO writer_requests VALUES(?,?)",
                (
                    request_id,
                    dump({"id": updated["id"], "version": updated["version"]}),
                ),
            )
            return {"id": updated["id"], "version": updated["version"]}

    def history(self, node_id):
        with database(self.path) as con:
            self.node(con, node_id, True)
            return [
                dict(r)
                for r in con.execute(
                    "SELECT id,version,source,operation,original,created,important FROM writer_revisions WHERE node=? ORDER BY id DESC LIMIT 200",
                    (node_id,),
                )
            ]

    def revision(self, node_id, revision_id):
        with database(self.path) as con:
            self.node(con, node_id, True)
            row = con.execute(
                "SELECT * FROM writer_revisions WHERE id=? AND node=?",
                (revision_id, node_id),
            ).fetchone()
            if not row:
                raise ReadError("Revisão não pertence ao documento.")
            result = dict(row)
            result["before"] = read_snapshot(result["before"])
            result["after"] = read_snapshot(result["after"])
            return result

    def restore(self, node_id, base_version, revision_id):
        with self.transaction() as con:
            node = self.node(con, node_id, True)
            self.check_version(node, base_version)
            row = con.execute(
                "SELECT after FROM writer_revisions WHERE id=? AND node=?",
                (revision_id, node_id),
            ).fetchone()
            if not row:
                raise ReadError("Revisão não pertence ao documento.")
            snapshot_value = read_snapshot(row[0])
            if snapshot_value["parent"]:
                self.node(con, snapshot_value["parent"])
            return self.record(
                con,
                node,
                {**snapshot_value, "deleted": 0},
                "restore",
                "restore",
                reference=str(revision_id),
            )

    def revision_stacks(self, con, node_id):
        applied = []
        reverted = []
        for row in con.execute(
            "SELECT * FROM writer_revisions WHERE node=? ORDER BY id", (node_id,)
        ):
            if row["operation"] == "undo":
                if applied:
                    reverted.append(applied.pop())
            elif row["operation"] == "redo":
                if reverted:
                    applied.append(reverted.pop())
            else:
                applied.append(row)
                reverted = []
        return applied, reverted

    def undo(self, node_id, base_version, redo=False):
        with self.transaction() as con:
            node = self.node(con, node_id, True)
            self.check_version(node, base_version)
            applied, reverted = self.revision_stacks(con, node_id)
            choices = reverted if redo else applied
            if not choices or (not redo and choices[-1]["operation"] == "create"):
                raise ReadError(
                    "Não há alteração para refazer."
                    if redo
                    else "Não há alteração para desfazer. Use remover para descartar um documento novo."
                )
            target = choices[-1]
            group = list(
                con.execute(
                    "SELECT * FROM writer_revisions WHERE batch=?", (target["batch"],)
                )
            )
            batch = uid()
            result = None
            for revision in group:
                current = self.node(con, revision["node"], True)
                other_applied, other_reverted = self.revision_stacks(
                    con, revision["node"]
                )
                candidates = other_reverted if redo else other_applied
                if not candidates or candidates[-1]["id"] != revision["id"]:
                    raise WriterConflict(
                        "Outro documento desta operação mudou. Compare as revisões antes de recuperar."
                    )
                previous = (
                    read_snapshot(revision["after"] if redo else revision["before"])
                    if (redo or revision["before"])
                    else {**current, "deleted": 1}
                )
                changed = self.record(
                    con,
                    current,
                    previous,
                    "restore",
                    "redo" if redo else "undo",
                    reference=str(revision["id"]),
                    batch=batch,
                )
                if current["id"] == node_id:
                    result = changed
            return result

    def messages(self, node_id):
        with database(self.path) as con:
            if node_id:
                self.node(con, node_id, True)
            return [
                dict(r)
                for r in reversed(
                    list(
                        con.execute(
                            "SELECT * FROM writer_messages WHERE node IS ? ORDER BY created DESC,id DESC LIMIT 100",
                            (node_id,),
                        )
                    )
                )
            ]

    def proposal(self, proposal_id):
        with database(self.path) as con:
            row = con.execute(
                "SELECT * FROM writer_proposals WHERE id=?", (identifier(proposal_id),)
            ).fetchone()
            if not row:
                raise ReadError("Proposta não pertence a este projeto.")
            result = dict(row)
            for key in ["plan", "versions", "original"]:
                result[key] = json.loads(result[key])
            return result

    def propose(
        self,
        plan,
        instruction,
        intent,
        base,
        auto=False,
        message_id=None,
        connection=None,
    ):
        plan = Operation.model_validate(plan).model_dump()
        with (
            nullcontext(connection) if connection is not None else self.transaction()
        ) as con:
            node = (
                self.node(con, plan["targetDocumentId"])
                if plan["targetDocumentId"]
                else None
            )
            if node:
                self.check_version(node, base)
            self.validate_plan(con, plan, node)
            if plan["operation"] in {"create", "rename", "split"}:
                title(plan["title"])
            versions = {node["id"]: node["version"]} if node else {}
            if plan["destinationDocumentId"]:
                destination = self.node(con, plan["destinationDocumentId"])
                versions[destination["id"]] = destination["version"]
            proposal_id = uid()
            created = now()
            expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
            structural = plan["operation"] not in {"append", "replace"}
            con.execute(
                "INSERT INTO writer_proposals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    proposal_id,
                    node["id"] if node else None,
                    base,
                    dump(plan),
                    dump(versions),
                    self.tree_hash(con) if structural else None,
                    intent,
                    instruction,
                    dump(node),
                    "PENDING",
                    int(auto),
                    created,
                    expires,
                    None,
                    None,
                ),
            )
            if message_id:
                con.execute(
                    "UPDATE writer_messages SET proposal=? WHERE id=?",
                    (proposal_id, message_id),
                )
            row = dict(
                con.execute(
                    "SELECT * FROM writer_proposals WHERE id=?", (proposal_id,)
                ).fetchone()
            )
            for key in ["plan", "versions", "original"]:
                row[key] = json.loads(row[key])
            return row

    def validate_plan(self, con, plan, node):
        operation = plan["operation"]
        if operation != "create" and node is None:
            raise ReadError("Escolha o documento de destino.")
        if (
            operation in {"append", "replace", "move_blocks", "split"}
            and node["kind"] == "folder"
        ):
            raise ReadError("Escolha um documento, não uma pasta.")
        if operation in {"replace", "move_blocks", "split"}:
            selected = plan["blockIds"]
            positions = [i for i, b in enumerate(node["blocks"]) if b["id"] in selected]
            if (
                not positions
                or len(set(selected)) != len(selected)
                or len(positions) != len(selected)
                or positions != list(range(min(positions), max(positions) + 1))
            ):
                raise ReadError(
                    "Selecione blocos consecutivos existentes no documento."
                )
            return positions
        return []

    def decide(self, req):
        conflicted = False
        with self.transaction() as con:
            row = con.execute(
                "SELECT * FROM writer_proposals WHERE id=?", (identifier(req.id),)
            ).fetchone()
            if not row:
                raise ReadError("Proposta indisponível.")
            if row["state"] == "APPLIED":
                return {
                    "state": "APPLIED",
                    "id": row["result_node"] or row["node"],
                    "version": row["result_version"],
                }
            if row["state"] != "PENDING":
                raise ReadError("Esta proposta não está pendente.")
            if row["expires"] < now():
                con.execute(
                    "UPDATE writer_proposals SET state='EXPIRED' WHERE id=?", (req.id,)
                )
                return {"state": "EXPIRED"}
            if not req.approve:
                con.execute(
                    "UPDATE writer_proposals SET state='REJECTED' WHERE id=?", (req.id,)
                )
                return {"state": "REJECTED"}
            plan = json.loads(row["plan"])
            versions = json.loads(row["versions"])
            if req.automatic and (
                not self.settings(con)["enabled"]
                or not self.settings(con)["auto_write"]
                or not self.settings(con)["cloud_consent"]
                or not row["auto"]
                or plan["operation"] != "append"
                or req.edited_blocks is not None
            ):
                raise ReadError("Esta alteração exige aprovação explícita.")
            if req.edited_blocks is not None:
                if plan["operation"] not in {"append", "replace"}:
                    raise ReadError("Ajuste estrutural exige uma nova proposta.")
                plan["blocks"] = blocks(req.edited_blocks)
            for key, version in versions.items():
                current = self.node(con, key, True)
                if current["version"] != version or current["deleted"]:
                    conflicted = True
            if row["tree_hash"] and row["tree_hash"] != self.tree_hash(con):
                conflicted = True
            if conflicted:
                con.execute(
                    "UPDATE writer_proposals SET state='CONFLICTED' WHERE id=?",
                    (req.id,),
                )
                return {
                    "state": "CONFLICTED",
                    "message": "O documento mudou. Solicite uma nova versão; nenhuma alteração foi aplicada.",
                }
            node = self.node(con, row["node"]) if row["node"] else None
            positions = self.validate_plan(con, plan, node)
            batch = uid()
            operation = plan["operation"]

            def record(item, updated):
                return self.record(
                    con,
                    item,
                    updated,
                    "ai" if row["intent"] != "MANUAL" else "manual",
                    operation,
                    row["instruction"],
                    req.id,
                    batch,
                )

            fresh = lambda: [{**b, "id": uid()} for b in plan["blocks"]]
            if operation == "create":
                result = self.create_in(
                    con,
                    title(plan["title"]),
                    plan["kind"],
                    plan["parentId"],
                    batch,
                    "ai",
                )
            elif operation == "append":
                result = record(node, {**node, "blocks": node["blocks"] + fresh()})
            elif operation == "replace":
                result = record(
                    node,
                    {
                        **node,
                        "blocks": node["blocks"][: min(positions)]
                        + fresh()
                        + node["blocks"][max(positions) + 1 :],
                    },
                )
            elif operation == "rename":
                result = record(node, {**node, "title": title(plan["title"])})
            elif operation == "move":
                parent = plan["parentId"]
                ancestor = parent
                visited = {node["id"]}
                while ancestor:
                    if ancestor in visited:
                        raise ReadError("Um item não pode conter a si mesmo.")
                    visited.add(ancestor)
                    ancestor = self.node(con, ancestor)["parent"]
                result = record(
                    node, {**node, "parent": parent, "position": plan["position"]}
                )
            elif operation == "delete":
                targets = [node]
                cursor = 0
                while cursor < len(targets):
                    targets += [
                        self.node(con, r[0])
                        for r in con.execute(
                            "SELECT id FROM writer_nodes WHERE parent=? AND deleted=0",
                            (targets[cursor]["id"],),
                        )
                    ]
                    cursor += 1
                for item in targets:
                    result = record(item, {**item, "deleted": 1})
            elif operation == "move_blocks":
                destination = self.node(con, plan["destinationDocumentId"])
                if destination["id"] == node["id"] or destination["kind"] == "folder":
                    raise ReadError("Escolha outro documento de destino.")
                moved = node["blocks"][min(positions) : max(positions) + 1]
                record(
                    node,
                    {
                        **node,
                        "blocks": node["blocks"][: min(positions)]
                        + node["blocks"][max(positions) + 1 :],
                    },
                )
                result = record(
                    destination,
                    {**destination, "blocks": destination["blocks"] + moved},
                )
            elif operation == "split":
                index = min(positions)
                if index == 0:
                    raise ReadError(
                        "A divisão precisa preservar texto em ambas as partes."
                    )
                new = self.create_in(
                    con, title(plan["title"]), node["kind"], node["parent"], None, "ai"
                )
                # Creation is part of the same undo batch; record only one revision per node in a batch.
                con.execute(
                    "UPDATE writer_revisions SET batch=? WHERE node=?",
                    (batch, new["id"]),
                )
                # Fill its creation snapshot rather than generating a second same-batch revision.
                filled = {**new, "blocks": node["blocks"][index:]}
                con.execute(
                    "UPDATE writer_nodes SET blocks=? WHERE id=?",
                    (dump(blocks(filled["blocks"])), new["id"]),
                )
                con.execute(
                    "UPDATE writer_revisions SET after=? WHERE node=? AND version=1",
                    (snapshot(filled), new["id"]),
                )
                result = record(node, {**node, "blocks": node["blocks"][:index]})
            else:
                raise ReadError("Operação não suportada.")
            con.execute(
                "UPDATE writer_proposals SET state='APPROVED' WHERE id=?", (req.id,)
            )
            con.execute(
                "UPDATE writer_proposals SET state='APPLIED',result_version=?,result_node=? WHERE id=?",
                (result["version"], result["id"], req.id),
            )
            return {
                "state": "APPLIED",
                "id": result["id"],
                "version": result["version"],
            }

    def prune(self, confirmed):
        if confirmed is not True:
            raise ReadError("Confirme a remoção de revisões manuais antigas.")
        keep = self.settings()["retention"]
        with self.transaction() as con:
            count = con.execute(
                "DELETE FROM writer_revisions WHERE important=0 AND id NOT IN (SELECT max(id) FROM writer_revisions GROUP BY node) AND id NOT IN (SELECT id FROM writer_revisions ORDER BY id DESC LIMIT ?)",
                (keep,),
            ).rowcount
        return {"removed": count, "important_preserved": True}
