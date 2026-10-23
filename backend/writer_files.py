"""Native-selected source files. Paths never enter model context or renderer payloads."""

import copy
import hashlib
import io
import os
import stat
import tempfile
import uuid
import zipfile
import threading
from functools import wraps
from pathlib import Path

from project_store import database
from programming.security import ReadError
from writer_store import WriterConflict, blocks, title

_locks = {}


def serialized(function):
    @wraps(function)
    def call(self, *args, **kwargs):
        with _locks.setdefault(str(self.writer.path), threading.RLock()):
            return function(self, *args, **kwargs)

    return call


def checked_path(value):
    path = Path(value).absolute()
    if any(part.lower() == "backup" for part in path.parts):
        raise ReadError("Backup é somente leitura.")
    if path.suffix.lower() not in {".txt", ".md", ".docx"}:
        raise ReadError("Escolha um arquivo TXT, Markdown ou Word simples (.docx).")
    if path.parent.resolve() != path.parent:
        raise ReadError("Pasta redirecionada não permitida.")
    if path.exists():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or path.is_symlink() or info.st_nlink != 1:
            raise ReadError("Arquivo redirecionado ou compartilhado não permitido.")
        if info.st_size > 5 * 1024 * 1024:
            raise ReadError("Arquivo acima de 5 MB.")
    return path


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read_file(path):
    with path.open("rb") as handle:
        raw = handle.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise ReadError("Arquivo acima de 5 MB.")
    return raw


def word(raw):
    from docx import Document

    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries) > 2000 or sum(x.file_size for x in entries) > 25 * 1024 * 1024:
            raise ReadError("Documento compactado acima do limite seguro.")
        if any("vbaproject" in x.filename.lower() for x in entries):
            raise ReadError("Macros não são suportadas.")
    document = Document(io.BytesIO(raw))
    # Avoid losing features the structured editor cannot faithfully represent.
    unsupported = document.element.xpath(
        ".//w:tbl | .//w:drawing | .//w:pict | .//w:hyperlink | .//w:fldChar | .//w:ins | .//w:del | .//w:sdt | .//w:altChunk | .//w:object"
    )
    if unsupported:
        raise ReadError(
            "Este Word contém tabelas, imagens ou recursos avançados. Use uma cópia em texto simples no Writer."
        )
    return document


class WriterFiles:
    def __init__(self, writer):
        self.writer = writer
        with database(writer.path) as con:
            con.execute(
                "CREATE TABLE IF NOT EXISTS writer_files(node TEXT PRIMARY KEY,path TEXT NOT NULL,hash TEXT NOT NULL,version INTEGER NOT NULL)"
            )

    def info(self, node):
        with database(self.writer.path) as con:
            row = con.execute(
                "SELECT * FROM writer_files WHERE node=?", (node,)
            ).fetchone()
        return dict(row) if row else None

    def public_info(self, node):
        value = self.info(node)
        return {
            "linked": bool(value),
            "name": Path(value["path"]).name if value else None,
            "saved_version": value["version"] if value else None,
        }

    @serialized
    def attach(self, value, create=False):
        path = checked_path(value)
        if not create:
            with database(self.writer.path) as con:
                links = con.execute("SELECT node,path FROM writer_files").fetchall()
                existing = next(
                    (r for r in links if Path(r["path"]).absolute() == path), None
                )
            if existing:
                return self.writer.bind_chat(existing["node"])
        if create and path.exists():
            raise ReadError(
                "Já existe um arquivo nesse destino. Escolha-o pela opção Abrir arquivo."
            )
        raw = b"" if create else read_file(path)
        parsed = []
        if raw and path.suffix.lower() == ".docx":
            document = word(raw)
            for p in document.paragraphs:
                kind = {
                    "Heading 1": "heading1",
                    "Heading 2": "heading2",
                    "List Bullet": "bullet",
                    "List Number": "number",
                }.get(p.style.name, "paragraph")
                parsed.append({"id": str(uuid.uuid4()), "type": kind, "text": p.text})
        elif raw:
            text = raw.decode("utf-8-sig")
            if "\x00" in text:
                raise ReadError("Arquivo de texto inválido.")
            parsed = [
                {"id": str(uuid.uuid4()), "type": "paragraph", "text": p}
                for p in text.split("\n\n")
            ]
        parsed = blocks(parsed)
        with self.writer.transaction() as con:
            node = self.writer.create_in(con, title(path.name))
            if parsed:
                node = self.writer.record(
                    con, node, {**node, "blocks": parsed}, "manual", "import"
                )
            con.execute(
                "INSERT INTO writer_files VALUES(?,?,?,?)",
                (node["id"], str(path), digest(raw), 0 if create else node["version"]),
            )
        if create:
            self.sync(node["id"], creating=True)
        return self.writer.bind_chat(node["id"])

    @serialized
    def sync(self, node, creating=False):
        link = self.info(node)
        if not link:
            return {"linked": False}
        current = self.writer.get(node)
        path = checked_path(link["path"])
        if creating:
            if path.exists():
                raise WriterConflict(
                    "O destino já existe. Nenhum arquivo foi substituído."
                )
            raw = b""
        else:
            if not path.exists():
                raise WriterConflict(
                    "O arquivo original foi movido ou removido. Exporte uma cópia para recuperar sua edição."
                )
            raw = read_file(path)
            if digest(raw) != link["hash"]:
                raise WriterConflict(
                    "O arquivo mudou em outro programa. Sua edição está salva no JARVIS; exporte uma cópia para comparar antes de substituir o original."
                )
        if path.suffix.lower() == ".docx":
            from docx import Document
            from writer_export import inline

            document = word(raw) if raw else Document()
            previous = {}
            for p in document.paragraphs:
                previous.setdefault(p.text, []).append(copy.deepcopy(p._p))
            for child in list(document.element.body):
                if not child.tag.endswith("}sectPr"):
                    document.element.body.remove(child)
            for b in current["blocks"]:
                unchanged = previous.get(b["text"])
                if unchanged:
                    document.element.body.insert(
                        len(document.element.body) - 1, unchanged.pop(0)
                    )
                elif b["type"] == "pagebreak":
                    document.add_page_break()
                else:
                    style = {
                        "heading1": "Heading 1",
                        "heading2": "Heading 2",
                        "bullet": "List Bullet",
                        "number": "List Number",
                    }.get(b["type"])
                    inline(document.add_paragraph(style=style), b["text"])
            output = io.BytesIO()
            document.save(output)
            content = output.getvalue()
        else:
            content = "\n\n".join(b["text"] for b in current["blocks"]).encode("utf-8")
        if len(content) > 5 * 1024 * 1024:
            raise ReadError(
                "Arquivo resultante acima de 5 MB. Exporte os capítulos separadamente."
            )
        temporary = None
        try:
            fd, temporary = tempfile.mkstemp(prefix=".jarvis-writer-", dir=path.parent)
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            checked_path(path)
            if self.writer.get(node)["version"] != current["version"]:
                raise WriterConflict(
                    "O documento mudou durante o salvamento. Tente salvar novamente."
                )
            if creating:
                # Exclusive creation; never replace a file created after the chooser closed.
                with path.open("xb") as handle:
                    handle.write(content)
            else:
                if digest(read_file(path)) != link["hash"]:
                    raise WriterConflict(
                        "O arquivo foi alterado durante o salvamento. Exporte uma cópia."
                    )
                os.replace(temporary, path)
                temporary = None
            with database(self.writer.path) as con:
                con.execute(
                    "UPDATE writer_files SET hash=?,version=? WHERE node=?",
                    (digest(content), current["version"], node),
                )
        finally:
            if temporary:
                Path(temporary).unlink(missing_ok=True)
        return self.public_info(node)
