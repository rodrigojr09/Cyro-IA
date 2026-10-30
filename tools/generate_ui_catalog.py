"""Rebuild the read-only frontend source catalog without executing app code."""

from pathlib import Path
import html
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
IMPORT = re.compile(r"@import\s+url\(['\"]([^'\"]+)['\"]\)\s*;")


def generate():
    listed = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--",
         "desktop"], cwd=ROOT, text=True, encoding="utf-8"
    ).splitlines()
    files = sorted({p for p in listed if p.startswith("desktop/") and (ROOT / p).is_file()})
    pages = [p for p in files if p.startswith("desktop/") and p.endswith(".html")
             and "/tests/" not in p]
    components = [p for p in files if
                  (p.startswith("desktop/scripts/") and p.endswith((".jsx", ".tsx"))) or
                  (p.startswith(("cloud/app/", "cloud/components/", "packages/"))
                   and p.endswith((".jsx", ".tsx")))]
    styles = [p for p in files if p.endswith(".css") and
              p.startswith(("desktop/", "cloud/app/", "cloud/components/", "packages/"))
              and not any(part in p.split("/") for part in ("tests", "test", "dist", "node_modules"))]
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    chunks, included = [], []

    def include_css(path):
        path = path.resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError("Importação CSS fora do projeto")
        name = path.relative_to(ROOT).as_posix()
        if name in included:
            return
        included.append(name)
        source = path.read_text(encoding="utf-8")
        chunks.append(f"\n/* ===== INÍCIO: {name} ===== */\n")
        cursor = 0
        for match in IMPORT.finditer(source):
            chunks.append(source[cursor:match.start()])
            include_css(path.parent / match.group(1))
            cursor = match.end()
        chunks.extend([source[cursor:], f"\n/* ===== FIM: {name} ===== */\n"])

    for name in ["desktop/app.css", "desktop/login.css", "desktop/quick.css",
                 "desktop/clipboard.css", "desktop/writer.css"] + styles:
        include_css(ROOT / name)

    # Catalog-specific rules are isolated from the app's UI selectors.
    viewer = """
/* ===== VISUALIZADOR DO CATÁLOGO paginas.html ===== */
body.cyro-source-catalog { display:block; margin:0; padding:24px; overflow:auto; height:auto; min-height:100vh; font:14px/1.6 system-ui,sans-serif; background:#0d1117; color:#e6edf3; }
.cyro-source-catalog main { max-width:1200px; margin:auto; }
.cyro-source-catalog h1, .cyro-source-catalog a { color:#8ee0ff; }
.cyro-source-catalog details { margin:16px 0; border:1px solid #293241; border-radius:8px; padding:12px; }
.cyro-source-catalog summary { cursor:pointer; overflow-wrap:anywhere; }
.cyro-source-catalog pre { display:block; white-space:pre; overflow:auto; max-height:70vh; padding:16px; background:#111827; color:#e6edf3; font:12px/1.6 ui-monospace,monospace; }
.cyro-source-catalog code { background:transparent; color:inherit; }
.cyro-source-catalog a:focus-visible, .cyro-source-catalog summary:focus-visible { outline:2px solid #8ee0ff; outline-offset:2px; }
"""
    css = (f"/* Cyro IA {version} — todos os estilos de interface para consulta.\n"
           "Cada bloco identifica sua origem; importações locais incorporadas.\n"
           "Desktop e Cloud têm contextos globais distintos. Não é uma entrada de produção. */\n"
           + "".join(chunks) + viewer)
    sources = pages + components
    sections, index = [], []
    for number, name in enumerate(sources, 1):
        label = "Página HTML" if name in pages else "Componente / página React"
        if name == "desktop/scripts/computer/Computer.jsx":
            label += " legado (seção removida das configurações)"
        escaped = html.escape((ROOT / name).read_text(encoding="utf-8"))
        sections.append(
            f"<!-- ===== INÍCIO: {name} — {label} ===== -->\n"
            f'<details id="fonte-{number}"><summary>{html.escape(name)} — {label}</summary>\n'
            f"<pre><code>{escaped}</code></pre></details>\n"
            f"<!-- ===== FIM: {name} ===== -->"
        )
        index.append(f'<li><a href="#fonte-{number}">{html.escape(name)}</a></li>')
    document = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'">
<title>Cyro IA — Todas as páginas e componentes</title><link rel="stylesheet" href="styles.css"></head>
<body class="cyro-source-catalog"><main>
<!-- Referência estática: fontes completas escapadas para não executar scripts ou chamadas. -->
<h1>Cyro IA — Páginas, componentes e estilos</h1>
<p>Referência consolidada da v{html.escape(version)}. Todos os arquivos próprios de interface Desktop e Cloud estão abaixo, incluindo páginas, layouts, estados de carregamento, entradas e componentes compartilhados. O componente legado Computador é identificado separadamente.</p>
<p>Este catálogo mostra o código completo; não executa as telas React nem substitui o aplicativo. styles.css reúne as folhas de estilo, incluindo o realce de código compilado. As fontes de produção continuam separadas.</p>
<p>{len(pages)} HTMLs · {len(components)} fontes React · {len(included)} CSSs.</p>
<p>Identidade: <a href="backend/jarvis_identity.py">backend/jarvis_identity.py</a>. Visão geral: <a href="README.md">README.md</a>. Estado atual: <a href="docs/VALIDATION.md">docs/VALIDATION.md</a>.</p>
<details><summary>Índice completo de arquivos</summary><ul>{''.join(index)}</ul></details>
{chr(10).join(sections)}
</main></body></html>
"""
    # Verify that aggregation retains every source and leaves no executable scripts.
    blocks = re.findall(r"<pre><code>(.*?)</code></pre>", document, re.S)
    assert len(blocks) == len(sources)
    for name, block in zip(sources, blocks):
        assert html.unescape(block) == (ROOT / name).read_text(encoding="utf-8")
    assert not re.search(r"<script\b", document, re.I)
    assert not IMPORT.search(css)
    assert set(styles).issubset(included)
    (ROOT / "paginas.html").write_text(document, encoding="utf-8")
    (ROOT / "styles.css").write_text(css, encoding="utf-8")
    print(f"Catálogo verificado: {len(pages)} HTMLs, {len(components)} fontes React, {len(included)} CSSs.")


if __name__ == "__main__":
    generate()
