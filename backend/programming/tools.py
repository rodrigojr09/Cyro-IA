"""Registro de ferramentas de leitura, independente das ações do computador."""

import json
import os
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from .context import ProgrammingContext
from .discovery import analyze, discover, project_candidates, project_root, walk
from .security import ReadError, ReadPolicy, normalized


class Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ProjectArgs(Arguments):
    project: str = Field(
        default="",
        max_length=512,
        description="Nome, caminho autorizado ou vazio para reutilizar o projeto selecionado.",
    )


class ListArgs(Arguments):
    query: str = Field(default="", max_length=120)


class DirectoryArgs(Arguments):
    path: str = Field(default=".", max_length=512)


class ReadArgs(Arguments):
    path: str = Field(
        min_length=1,
        max_length=512,
        description="Caminho, nome do arquivo ou referência como index.ts do backend.",
    )
    start_line: int = Field(default=1, ge=1, le=100000)
    end_line: int = Field(default=160, ge=1, le=100000)


class SearchArgs(Arguments):
    query: str = Field(
        min_length=1,
        max_length=120,
        description="Trecho literal; não aceita expressão regular nem comando.",
    )
    path: str = Field(default=".", max_length=512)


class StructureArgs(DirectoryArgs):
    depth: int = Field(default=3, ge=0, le=5)


SPECS = [
    (
        "list_projects",
        "Localiza projetos apenas nas pastas explicitamente autorizadas. Filtre pelo nome.",
        ListArgs,
    ),
    (
        "select_project",
        "Seleciona e reutiliza um projeto; se ambíguo retorna opções, sem escolher automaticamente.",
        ProjectArgs,
    ),
    (
        "list_directory",
        "Lista até 100 arquivos e subpastas permitidos, sem conteúdo.",
        DirectoryArgs,
    ),
    (
        "read_file",
        "Lê de 1 a 200 linhas numeradas de texto permitido. Resolve nomes e pede esclarecimento se duplicados.",
        ReadArgs,
    ),
    (
        "search_files",
        "Busca por nome, extensão ou parte do caminho no projeto, sem ler conteúdo.",
        SearchArgs,
    ),
    (
        "search_code",
        "Busca literal por função, classe, variável, import ou trecho no código permitido.",
        SearchArgs,
    ),
    (
        "get_project_structure",
        "Resume a estrutura do projeto com limites de profundidade e quantidade.",
        StructureArgs,
    ),
    (
        "analyze_project",
        "Seleciona projeto e detecta tecnologias, dependências e arquivos principais estaticamente.",
        ProjectArgs,
    ),
    (
        "get_file_context",
        "Lê arquivo e até três imports locais relacionados; nunca executa imports.",
        ReadArgs,
    ),
]
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": model.model_json_schema(),
        },
    }
    for name, description, model in SPECS
]
STAGES = {
    "list_projects": "Localizando projeto...",
    "select_project": "Localizando projeto...",
    "read_file": "Lendo arquivo",
    "get_file_context": "Lendo arquivo e imports...",
    "search_files": "Localizando arquivos...",
    "search_code": "Pesquisando código...",
    "list_directory": "Consultando diretório...",
    "get_project_structure": "Analisando estrutura...",
    "analyze_project": "Analisando dependências...",
}


class ProgrammingService:
    def __init__(self, storage):
        self.storage = Path(storage)
        self.roots_file = self.storage / ".programming-roots.json"
        try:
            roots = json.loads(self.roots_file.read_text(encoding="utf-8"))
            if not isinstance(roots, list) or not all(
                isinstance(root, str) for root in roots
            ):
                roots = []
        except (OSError, ValueError):
            roots = []
        self.policy = ReadPolicy(roots[:10])
        self.context = ProgrammingContext(self.storage / ".programming-context.json")
        self.progress = "Pronto"

    def authorize(self, path):
        root = self.policy.authorize(path)
        self.roots_file.write_text(
            json.dumps([str(item) for item in self.policy.roots]), encoding="utf-8"
        )
        return {"authorized": str(root), "read_only": True}

    def revoke(self, path):
        self.policy.roots = [root for root in self.policy.roots if str(root) != path]
        self.roots_file.write_text(
            json.dumps([str(item) for item in self.policy.roots]), encoding="utf-8"
        )
        if self.context.data["project"]:
            try:
                self.policy.resolve(self.context.data["project"])
            except ReadError:
                self.context.select(None)
        return self.status()

    def status(self):
        selected = self.context.data["project"]
        try:
            selected = self.policy.resolve(selected) if selected else None
        except ReadError:
            selected = None
        return {
            "progress": self.progress,
            "read_only": True,
            "project": (
                {"name": selected.name, "path": str(selected)} if selected else None
            ),
            "roots": [
                {"name": root.name, "path": str(root)} for root in self.policy.roots
            ],
        }

    def selected(self):
        project = self.context.data["project"]
        if not project:
            raise ReadError(
                "Nenhum projeto selecionado. Localize e selecione um projeto autorizado primeiro."
            )
        return self.policy.resolve(project)

    def choose(self, reference):
        if not reference:
            return self.selected(), None
        candidates = list(
            dict.fromkeys(
                project_root(self.policy, path)
                for path in project_candidates(self.policy, reference)
            )
        )
        if len(candidates) != 1:
            return None, {
                "needs_clarification": True,
                "message": (
                    "Informe qual projeto deseja analisar."
                    if candidates
                    else "Projeto não encontrado nos limites da busca. Autorize a pasta ou informe um caminho mais específico."
                ),
                "candidates": [str(path) for path in candidates[:20]],
            }
        self.context.select(candidates[0])
        return candidates[0], None

    def locate_file(self, reference):
        base = self.context.data["project"]
        bare_name = (
            "/" not in reference and "\\" not in reference and ":" not in reference
        )
        try:
            path = self.policy.resolve(reference, base) if not bare_name else None
            if path is not None and path.is_file():
                if not base:
                    self.context.select(project_root(self.policy, path))
                return path, None
        except ReadError:
            # Não tente interpretar caminhos externos ou travessias como nomes de arquivo.
            if (
                ".." in reference.replace("\\", "/").split("/")
                or ":" in reference
                or Path(reference).is_absolute()
            ):
                raise
        base = self.selected()
        parts = re.split(r"\s+(?:do|da|no|na)\s+", reference.strip(), maxsplit=1)
        filename, section = parts[0].strip('"\x27'), (
            normalized(parts[1]) if len(parts) > 1 else ""
        )
        listing = walk(self.policy, base)
        matches = [
            item["path"]
            for item in listing["entries"]
            if item["type"] == "file"
            and normalized(item["name"]) == normalized(filename)
            and (
                not section
                or section
                in [normalized(part) for part in Path(item["relative_path"]).parts[:-1]]
            )
        ]
        if len(matches) != 1:
            return None, {
                "needs_clarification": True,
                "message": (
                    "Escolha um caminho completo entre os candidatos."
                    if matches
                    else "Arquivo não encontrado ou protegido. Informe um caminho mais específico."
                ),
                "candidates": matches[:20],
                "truncated": listing["truncated"],
            }
        return self.policy.resolve(matches[0]), None

    def dispatch(self, name, arguments):
        models = {name: model for name, _, model in SPECS}
        if name not in models:
            raise ReadError(
                "Ferramenta de leitura não permitida. Escrita e execução são indisponíveis."
            )
        request = models[name].model_validate_json(arguments)
        if not self.policy.roots:
            raise ReadError(
                "Nenhuma pasta autorizada. Use Autorizar pasta na interface; a IA não pode conceder acesso."
            )
        self.progress = STAGES[name]
        if name == "list_projects":
            return discover(self.policy, request.query)
        if name in {"select_project", "analyze_project"}:
            project, clarification = self.choose(request.project)
            if clarification:
                return clarification
            return (
                analyze(self.policy, project)
                if name == "analyze_project"
                else self.status()
            )
        if name in {"read_file", "get_file_context"}:
            path, clarification = self.locate_file(request.path)
            if clarification:
                return clarification
            self.progress = f"Lendo arquivo {path.name}..."
            result = self.policy.read(
                path, start_line=request.start_line, end_line=request.end_line
            )
            if name == "get_file_context":
                result["related"] = self.related(path, result["content"])
            self.context.record(path)
            return result
        base = self.selected()
        directory = self.policy.resolve(request.path, base)
        listing = walk(
            self.policy,
            directory,
            depth=(
                0
                if name == "list_directory"
                else request.depth if name == "get_project_structure" else 6
            ),
        )
        entries = listing.pop("entries")
        if name == "search_code":
            return self.search_code(entries, request.query, listing)
        if name == "search_files":
            entries = [
                item
                for item in entries
                if item["type"] == "file"
                and normalized(request.query.removeprefix("*"))
                in normalized(item["relative_path"])
            ]
        limit = 100 if name == "list_directory" else 150
        return {
            **listing,
            "entries": entries[:limit],
            "truncated": listing["truncated"] or len(entries) > limit,
        }

    def search_code(self, entries, query, listing):
        matches, scanned, chars, skipped = [], 0, 0, 0
        truncated = listing["truncated"]
        for item in entries:
            if item["type"] != "file":
                continue
            if scanned >= 40 or chars >= 256000 or len(matches) >= 30:
                truncated = True
                break
            scanned += 1
            try:
                path, text = self.policy.text(item["path"])
            except ReadError:
                skipped += 1
                continue
            lines = text[: max(0, 256000 - chars)].splitlines()
            truncated |= chars + len(text) > 256000
            chars += len(text)
            for number, line in enumerate(lines, 1):
                index = line.casefold().find(query.casefold())
                if index >= 0:
                    matches.append(
                        {
                            "path": str(path),
                            "line": number,
                            "excerpt": line[max(0, index - 60) : index + 240],
                        }
                    )
                    if len(matches) >= 30:
                        truncated = True
                        break
        return {
            "matches": matches,
            "scanned_files": scanned,
            "skipped_files": skipped,
            "truncated": truncated,
            "untrusted_content": True,
        }

    def related(self, path, content):
        imports = re.findall(
            r'(?:from\s+|import\s*\(|require\s*\()\s*["\x27](\.[^"\x27]+)["\x27]',
            content,
        )
        # Imports Python relativos simples; nunca carrega módulos.
        imports += [
            value.replace(".", "/")
            for value in re.findall(r"from\s+\.([\w.]+)\s+import", content)
        ]
        results = []
        for value in list(dict.fromkeys(imports))[:3]:
            target = Path(os.path.abspath(path.parent / value))
            for candidate in [
                target,
                *[
                    Path(str(target) + suffix)
                    for suffix in (".ts", ".tsx", ".js", ".py")
                ],
                target / "index.ts",
                target / "__init__.py",
            ]:
                try:
                    result = self.policy.read(candidate, start_line=1, end_line=60)
                except ReadError:
                    continue
                results.append(result)
                self.context.record(candidate)
                break
        return results
