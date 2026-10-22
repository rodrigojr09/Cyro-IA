"""Seleção local de fontes: metadados gratuitos e fronteira de leitura por projeto."""

import hashlib
import json
import os
import time
import stat
from pathlib import Path, PureWindowsPath

from programming.security import (
    IGNORED,
    MAX_FILE_BYTES,
    ReadError,
    ReadPolicy,
    generated,
    readable_name,
    sensitive,
)

MAX_PROJECT_BYTES = 5 * 1024 * 1024


class ProjectSizeError(ReadError):
    pass


def selection_size(root, selection, enforce=True):
    """Count selected files once, using metadata only; fail closed on incomplete scans."""
    root = Path(root)
    policy = SelectedReadPolicy(root, selection)
    total, visited, seen = 0, 0, set()
    deadline = time.monotonic() + 3
    stack = [(rule, 0) for rule in selection.include]
    while stack:
        relative, depth = stack.pop()
        if relative.casefold() in seen:
            continue
        seen.add(relative.casefold())
        visited += 1
        if visited > 2000 or depth > 32 or time.monotonic() > deadline:
            raise ReadError(
                "Não foi possível conferir o limite de 5 MB. Selecione menos arquivos ou subpastas menores."
            )
        # Protected/generated paths and redirects are never eligible sources.
        if any(
            part.casefold() in IGNORED or sensitive(part) or generated(part)
            for part in Path(relative).parts
        ):
            continue
        try:
            path = policy.resolve(relative, root)
            info = path.stat()
            if path.is_dir():
                with os.scandir(path) as entries:
                    for entry in entries:
                        if len(stack) + visited >= 2000:
                            raise ReadError(
                                "Não foi possível conferir o limite de 5 MB. Selecione menos arquivos ou subpastas menores."
                            )
                        child = Path(entry.path).relative_to(root).as_posix()
                        if selection.navigable(child):
                            stack.append((child, depth + 1))
            elif (
                selection.selected(relative)
                and stat.S_ISREG(info.st_mode)
                and info.st_nlink == 1
            ):
                total += info.st_size
                if enforce and total > MAX_PROJECT_BYTES:
                    raise ProjectSizeError(
                        "O total dos arquivos selecionados ultrapassa 5 MB. Remova arquivos da seleção antes de analisar ou conversar."
                    )
        except OSError:
            raise ReadError(
                "Não foi possível conferir o tamanho dos arquivos. Verifique a pasta antes de analisar."
            ) from None
        except ReadError as exc:
            if "5 MB" in str(exc):
                raise
            # A forbidden link is excluded, but an inaccessible file cannot certify a budget.
            if (root / relative).is_symlink():
                continue
            raise
    return total


def relative_rule(value):
    text = str(value).replace("\\", "/").strip().rstrip("/")
    if not text:
        raise ReadError("Caminho relativo vazio.")
    if text == ".":
        return "."
    if (
        len(text) > 512
        or Path(text).is_absolute()
        or PureWindowsPath(text).drive
        or ":" in text
        or "\x00" in text
        or ".." in text.split("/")
    ):
        raise ReadError(
            "Selecione somente caminhos relativos ao projeto, sem travessia."
        )
    return "/".join(part for part in text.split("/") if part and part != ".")


def under(path, parent):
    return parent == "." or path == parent or path.startswith(parent + "/")


class SourceSelection:
    def __init__(self, include, exclude):
        if len(include) > 300 or len(exclude) > 500:
            raise ReadError(
                "Limite de regras atingido. Selecione pastas maiores e exclua suas exceções."
            )
        self.include = sorted(set(relative_rule(item) for item in include))
        self.exclude = sorted(set(relative_rule(item) for item in exclude))
        if {item.casefold() for item in self.include} & {
            item.casefold() for item in self.exclude
        }:
            raise ReadError(
                "Um caminho não pode ser incluído e excluído na mesma seleção."
            )
        self.rules = [(item.casefold(), True) for item in self.include] + [
            (item.casefold(), False) for item in self.exclude
        ]
        self.revision = hashlib.sha256(
            json.dumps(
                [
                    sorted(item.casefold() for item in self.include),
                    sorted(item.casefold() for item in self.exclude),
                ],
                ensure_ascii=False,
            ).encode()
        ).hexdigest()

    def selected(self, relative):
        matches = [
            (len(rule), allowed)
            for rule, allowed in self.rules
            if under(relative.casefold(), rule)
        ]
        return max(matches, default=(-1, False))[1]

    def navigable(self, relative):
        return (
            relative == "."
            or self.selected(relative)
            or any(under(rule, relative.casefold()) for rule, yes in self.rules if yes)
        )


class SelectedReadPolicy(ReadPolicy):
    def __init__(self, root, selection):
        self.project_root = Path(root)
        self.selection = selection
        super().__init__([root])

    def allows_path(self, value, navigate=False):
        path = Path(value)
        try:
            relative = path.relative_to(self.project_root).as_posix()
        except ValueError:
            return False
        return (
            self.selection.navigable(relative)
            if navigate
            else self.selection.selected(relative)
        )

    def resolve(self, value, base=None):
        path = super().resolve(value, base)
        if not self.allows_path(path, navigate=path.is_dir()):
            raise ReadError(
                "Arquivo fora da seleção deste projeto. Ajuste Arquivos do projeto na interface."
            )
        return path


class RegisteredReadPolicy(ReadPolicy):
    """A API legada também respeita a seleção de projetos já cadastrados."""

    def __init__(self, roots, store):
        super().__init__(roots)
        self.store = store
        self.projects = sorted(
            store.projects(include_removed=True),
            key=lambda project: len(project["path"]),
            reverse=True,
        )
        self.policies = {}

    def owner_policy(self, path):
        for project in self.projects:
            if Path(path).is_relative_to(Path(project["path"])):
                if project["removed"] or not project["scope_confirmed"]:
                    raise ReadError(
                        "Projeto sem seleção confirmada ou removido do cadastro."
                    )
                if project["id"] not in self.policies:
                    self.policies[project["id"]] = self.store.read_policy(project["id"])
                return self.policies[project["id"]]
        return None

    def allows_path(self, value, navigate=False):
        try:
            policy = self.owner_policy(value)
            return policy.allows_path(value, navigate) if policy else True
        except ReadError:
            return False

    def resolve(self, value, base=None):
        path = super().resolve(value, base)
        policy = self.owner_policy(path)
        return policy.resolve(path) if policy else path


def browse_sources(root, relative=".", offset=0):
    """Só nomes, tipos e tamanhos: não abre conteúdos nem chama a API."""
    policy = ReadPolicy([root])
    directory = policy.resolve(relative_rule(relative), root)
    if not directory.is_dir():
        raise ReadError("O caminho não é uma pasta do projeto.")
    if offset < 0 or offset > 2000:
        raise ReadError("Página de seleção inválida.")
    entries = []
    visited = 0
    more = False
    try:
        with os.scandir(directory) as iterator:
            for entry in iterator:
                visited += 1
                if visited <= offset:
                    continue
                if len(entries) >= 200:
                    more = True
                    break
                path = Path(entry.path)
                info = entry.stat(follow_symlinks=False)
                directory_entry = entry.is_dir(follow_symlinks=False)
                reason = ""
                if entry.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
                    reason = "Link ou redirecionamento bloqueado"
                elif entry.name.casefold() in IGNORED:
                    reason = "Build, dependência ou cache ignorado automaticamente"
                elif sensitive(entry.name):
                    reason = "Arquivo ou pasta protegida"
                elif generated(entry.name):
                    reason = "Arquivo gerado ou de lock ignorado automaticamente"
                elif not directory_entry and (
                    not readable_name(entry.name)
                    or info.st_size > MAX_FILE_BYTES
                    or info.st_nlink > 1
                ):
                    reason = "Tipo, tamanho ou vínculo não permitido"
                entries.append(
                    {
                        "path": path.relative_to(Path(root)).as_posix(),
                        "name": entry.name,
                        "type": "directory" if directory_entry else "file",
                        "size": info.st_size if not directory_entry else None,
                        "disabled": bool(reason),
                        "reason": reason,
                    }
                )
    except OSError:
        raise ReadError("Não foi possível listar os metadados desta pasta.") from None
    entries.sort(
        key=lambda item: (item["type"] != "directory", item["name"].casefold())
    )
    return {
        "entries": entries,
        "path": relative_rule(relative),
        "next_offset": (
            offset + len(entries) if more and offset + len(entries) < 2000 else None
        ),
        "truncated": more,
        "metadata_only": True,
        "api_calls": 0,
    }


def selected_listing(policy):
    from programming.discovery import MAX_ENTRIES, MAX_SECONDS, walk

    entries = {}
    remaining = MAX_ENTRIES
    deadline = time.monotonic() + MAX_SECONDS
    partial = False
    skipped = 0
    roots = []
    for rule in sorted(policy.selection.include, key=len):
        if any(under(rule.casefold(), parent.casefold()) for parent in roots):
            continue
        roots.append(rule)
        if remaining <= 0 or time.monotonic() >= deadline:
            partial = True
            break
        try:
            path = policy.resolve(rule, policy.project_root)
            if path.is_file():
                items = [{"path": str(path), "name": path.name, "type": "file"}]
                remaining -= 1
            else:
                listing = walk(policy, path, max_entries=remaining, deadline=deadline)
                remaining -= listing["visited"]
                partial |= listing["truncated"]
                skipped += listing["skipped"]
                items = listing["entries"]
            for item in items:
                relative = (
                    Path(item["path"]).relative_to(policy.project_root).as_posix()
                )
                entries[relative] = {**item, "relative_path": relative}
        except ReadError:
            skipped += 1
    return {
        "entries": [entries[key] for key in sorted(entries)],
        "truncated": partial,
        "skipped": skipped,
        "visited": MAX_ENTRIES - remaining,
    }
