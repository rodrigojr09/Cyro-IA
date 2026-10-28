"""Real OOXML export with python-docx; all output stays in memory until a native Save dialog."""

import io
import re
from writer_store import WriterStore
from programming.security import ReadError


def inline(paragraph, text):
    for part in re.split(r"(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)", text):
        if not part:
            continue
        count = (
            3
            if part.startswith("***") and part.endswith("***")
            else (
                2
                if part.startswith("**") and part.endswith("**")
                else 1 if part.startswith("*") and part.endswith("*") else 0
            )
        )
        run = paragraph.add_run(part[count:-count] if count else part)
        run.bold = count in {2, 3}
        run.italic = count in {1, 3}


class WriterExportService:
    @staticmethod
    def collect(writer, selected):
        tree = [n for n in writer.open()["nodes"] if not n["deleted"]]
        ids = {n["id"] for n in tree}
        if any(x not in ids for x in selected):
            raise ReadError("A seleção de exportação não pertence ao projeto.")
        ordered = []
        seen = set()

        def walk(parent, include=False):
            for node in [n for n in tree if n["parent"] == parent]:
                if node["id"] in seen:
                    raise ReadError("Estrutura inválida.")
                seen.add(node["id"])
                chosen = include or not selected or node["id"] in selected
                if chosen and node["kind"] != "folder":
                    ordered.append(writer.get(node["id"]))
                walk(node["id"], chosen)

        walk(None)
        if not ordered:
            raise ReadError("Selecione ao menos um documento com conteúdo.")
        return ordered

    @staticmethod
    def export(writer, selected, format):
        documents = WriterExportService.collect(writer, selected)
        name = documents[0]["title"] if len(documents) == 1 else writer.project["name"]
        name = re.sub(r"\.(docx|md|txt)$", "", name, flags=re.I)
        if format in {"md", "txt"}:
            chunks = []
            for document in documents:
                chunks.append("# " + document["title"])
                for block in document["blocks"]:
                    prefix = {
                        "heading1": "## ",
                        "heading2": "### ",
                        "bullet": "- ",
                        "number": "1. ",
                    }.get(block["type"], "")
                    chunks.append(
                        "\n\n---\n\n"
                        if block["type"] == "pagebreak"
                        else prefix + block["text"]
                    )
            text = "\n\n".join(chunks)
            if format == "txt":
                text = (
                    re.sub(r"(?m)^#{1,3} ", "", text).replace("**", "").replace("*", "")
                )
            return (text.encode("utf-8"), name + "." + format)
        if format != "docx":
            raise ReadError("Formato de exportação inválido.")
        from docx import Document
        from docx.shared import Inches, Pt, RGBColor

        document = Document()
        section = document.sections[0]
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.top_margin = section.bottom_margin = Inches(0.85)
        section.left_margin = section.right_margin = Inches(0.9)
        normal = document.styles["Normal"]
        normal.font.name = "Calibri"
        normal.font.size = Pt(11)
        normal.paragraph_format.space_after = Pt(8)
        normal.paragraph_format.line_spacing = 1.15
        document.styles["Title"].font.color.rgb = RGBColor(0, 0, 0)
        document.core_properties.title = name
        for index, node in enumerate(documents):
            if index:
                document.add_page_break()
            document.add_paragraph(
                re.sub(r"\.(docx|md|txt)$", "", node["title"], flags=re.I),
                "Title" if index == 0 else "Heading 1",
            )
            for block in node["blocks"]:
                if block.get("rich"):
                    from writer_rich import export_node
                    export_node(document, block["rich"])
                    continue
                if block["type"] == "pagebreak":
                    document.add_page_break()
                    continue
                style = {
                    "heading1": "Heading 1",
                    "heading2": "Heading 2",
                    "bullet": "List Bullet",
                    "number": "List Number",
                }.get(block["type"], "Normal")
                inline(document.add_paragraph(style=style), block["text"])
        output = io.BytesIO()
        document.save(output)
        return output.getvalue(), name + ".docx"
