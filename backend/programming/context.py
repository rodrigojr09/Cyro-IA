"""Persistência somente de referências e resumos, dentro do próprio JARVIS."""

import json
import re
from pathlib import Path

from .security import redact


def memory_summary(text, limit=700):
    text = re.sub(
        r"```.*?(?:```|\Z)",
        "[bloco de código disponível apenas na conversa atual]",
        text,
        flags=re.S,
    )
    return redact(text)[:limit]


class ProgrammingContext:
    def __init__(self, state_file):
        self.state_file = Path(state_file)
        self.data = {
            "project": None,
            "last_file": None,
            "references": [],
            "problem": "",
            "suggestions": "",
        }
        try:
            if self.state_file.stat().st_size > 20000:
                raise ValueError
            loaded = json.loads(self.state_file.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                for key in ("project", "last_file", "problem", "suggestions"):
                    if isinstance(loaded.get(key), str):
                        self.data[key] = loaded[key][:700]
                if isinstance(loaded.get("references"), list):
                    self.data["references"] = [
                        item[:512]
                        for item in loaded["references"][-20:]
                        if isinstance(item, str)
                    ]
        except (OSError, ValueError):
            pass

    def save(self):
        # O caminho é definido pelo JARVIS, nunca por argumento da IA.
        self.state_file.write_text(
            json.dumps(self.data, ensure_ascii=False), encoding="utf-8"
        )

    def select(self, path):
        value = str(path) if path is not None else None
        if self.data["project"] != value:
            self.data = {
                "project": value,
                "last_file": None,
                "references": [],
                "problem": "",
                "suggestions": "",
            }
            self.save()

    def record(self, path):
        self.data["last_file"] = str(path)
        self.data["references"] = [
            item for item in self.data["references"] if item != str(path)
        ][-19:] + [str(path)]
        self.save()

    def remember(self, problem, suggestions):
        continuation = re.match(
            r"(?i)^\s*(e\b|como (?:posso|eu|corrig)|continue\b|explique melhor|por qu[eê]|sim\b)",
            problem,
        )
        if not self.data["problem"] or not continuation:
            self.data["problem"] = memory_summary(problem)
        self.data["suggestions"] = memory_summary(suggestions)
        self.save()
