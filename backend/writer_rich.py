"""Bounded ProseMirror data; no HTML, executable attributes or remote resources."""
from copy import deepcopy
from urllib.parse import urlparse

NODES = {"paragraph", "heading", "bulletList", "orderedList", "listItem", "table", "tableRow", "tableCell", "tableHeader", "hardBreak", "horizontalRule", "pageBreak", "blockquote", "codeBlock", "text"}
MARKS = {"bold", "italic", "underline", "strike", "code", "link"}
def plain(node):
    if node.get("type") == "text": return node.get("text", "")
    if node.get("type") == "hardBreak": return "\n"
    children = node.get("content", [])
    separator = "\n" if node.get("type") in {"bulletList", "orderedList", "listItem", "table", "tableRow", "tableCell", "tableHeader", "blockquote"} else ""
    return separator.join(plain(child) for child in children)

def validate(value):
    count = 0
    def walk(node, depth=0):
        nonlocal count
        count += 1
        if depth > 24 or count > 10000 or not isinstance(node, dict) or set(node) - {"type","attrs","content","text","marks"} or node.get("type") not in NODES:
            raise ValueError("Estrutura rica inválida ou acima do limite.")
        attrs = node.get("attrs") or {}
        if not isinstance(attrs,dict) or set(attrs) - {"id","textAlign","level","start","language","colspan","rowspan","colwidth"}: raise ValueError("Atributos não permitidos.")
        if attrs.get("id") is not None:
            from project_store import identifier
            identifier(attrs["id"])
        if attrs.get("textAlign") not in {None,"left","center","right","justify"}: raise ValueError("Alinhamento inválido.")
        for key,limit in [("level",6),("start",1000000),("colspan",100),("rowspan",100)]:
            if key in attrs and (type(attrs[key]) is not int or not 1 <= attrs[key] <= limit): raise ValueError("Atributo numérico inválido.")
        if attrs.get("language") is not None and (not isinstance(attrs["language"],str) or len(attrs["language"])>80): raise ValueError("Linguagem inválida.")
        if attrs.get("colwidth") is not None and (not isinstance(attrs["colwidth"],list) or len(attrs["colwidth"])>100 or any(type(x) is not int or not 1<=x<=10000 for x in attrs["colwidth"])): raise ValueError("Largura inválida.")
        if "text" in node and (node["type"] != "text" or not isinstance(node["text"],str) or len(node["text"])>12000): raise ValueError("Texto inválido.")
        if not isinstance(node.get("marks", []), list): raise ValueError("Formatação inválida.")
        for mark in node.get("marks",[]):
            if not isinstance(mark,dict) or set(mark)-{"type","attrs"} or mark.get("type") not in MARKS: raise ValueError("Formatação inválida.")
            ma=mark.get("attrs") or {}
            if not isinstance(ma,dict): raise ValueError("Formatação inválida.")
            if mark["type"] == "link":
                if set(ma)-{"href","target","rel","class","title"}: raise ValueError("Link inválido.")
                href=ma.get("href","")
                if not isinstance(href,str):raise ValueError("Link inválido.")
                parsed=urlparse(href)
                if parsed.scheme not in {"https","http","mailto"} or parsed.username or parsed.password or len(href)>2048: raise ValueError("Link inválido.")
                if parsed.scheme != "mailto" and not parsed.hostname: raise ValueError("Link inválido.")
                if any(v is not None and (not isinstance(v,str) or len(v)>2048) for v in ma.values()): raise ValueError("Link inválido.")
            elif ma: raise ValueError("Formatação inválida.")
        children=node.get("content",[])
        if not isinstance(children,list): raise ValueError("Conteúdo inválido.")
        for child in children: walk(child,depth+1)
        kind=node["type"]; kinds=[child["type"] for child in children]
        if kind in {"paragraph","heading","codeBlock"} and any(k not in {"text","hardBreak"} for k in kinds): raise ValueError("Parágrafo inválido.")
        if kind in {"bulletList","orderedList"} and any(k!="listItem" for k in kinds): raise ValueError("Lista inválida.")
        if kind=="table" and any(k!="tableRow" for k in kinds): raise ValueError("Tabela inválida.")
        if kind=="tableRow" and any(k not in {"tableCell","tableHeader"} for k in kinds): raise ValueError("Linha inválida.")
        if kind == "listItem" and (not kinds or kinds[0] != "paragraph"): raise ValueError("Item de lista inválido.")
        if kind in {"tableCell","tableHeader","blockquote"} and (not kinds or any(k in {"text","hardBreak","listItem","tableRow","tableCell","tableHeader"} for k in kinds)): raise ValueError("Estrutura inválida.")
        if kind in {"text","hardBreak","horizontalRule","pageBreak"} and children: raise ValueError("Nó inválido.")
    walk(value)
    if value["type"] in {"text","hardBreak","listItem","tableRow","tableCell","tableHeader"}: raise ValueError("Nó superior inválido.")
    return deepcopy(value)

def splice_inline(node, start, end, replacement):
    """Splice text leaves, preserving untouched formatting and list/table structure."""
    result=deepcopy(node); offset=0; inserted=False
    def walk(current):
        nonlocal offset,inserted
        kind=current['type']
        if kind in {'text','hardBreak'}:
            text=current.get('text','') if kind=='text' else '\n'
            length=len(text); left=max(0,min(length,start-offset)); right=max(0,min(length,end-offset)); origin=offset; offset+=length
            if start==end and not inserted and origin<=start<=offset:
                inserted=True
                return {**current,'type':'text','text':text[:left]+replacement+text[left:]}
            if start>=offset or end<=origin:return current
            middle=replacement if not inserted else ''; inserted=True
            value=text[:left]+middle+text[right:]
            if not value:return None
            return {**current,'type':'text','text':value} if kind=='text' else {'type':'text','text':value}
        separator='\n' if kind in {'bulletList','orderedList','listItem','table','tableRow','tableCell','tableHeader','blockquote'} else ''
        children=[]
        for index,child in enumerate(current.get('content',[])):
            if index:offset+=len(separator)
            updated=walk(child)
            if updated:children.append(updated)
        if 'content' in current:current['content']=children
        return current
    result=walk(result)
    if not inserted and replacement:
        if node['type'] in {'paragraph','heading','codeBlock'} and not plain(node): result['content']=[{'type':'text','text':replacement}]
        else: raise ValueError('Seleção sem texto editável.')
    return result


def export_node(container, node, list_style=None):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    kind=node["type"]; attrs=node.get("attrs") or {}
    if kind in {"pageBreak","horizontalRule"}:
        container.add_paragraph().add_run().add_break(__import__('docx.enum.text',fromlist=['WD_BREAK']).WD_BREAK.PAGE if kind=="pageBreak" else __import__('docx.enum.text',fromlist=['WD_BREAK']).WD_BREAK.LINE); return
    if kind=="table":
        rows=node.get("content",[])
        if not rows: return
        table=container.add_table(rows=0,cols=max(sum((cell.get("attrs") or {}).get("colspan",1) for cell in row.get("content",[])) for row in rows)); table.style="Table Grid"
        for row in rows:
            cells=table.add_row().cells; column=0
            for cell in row.get("content",[]):
                span=(cell.get("attrs") or {}).get("colspan",1); target=cells[column]
                if span>1: target=target.merge(cells[min(column+span-1,len(cells)-1)])
                target._element.remove(target.paragraphs[0]._p)
                for child in cell.get("content",[]): export_node(target,child)
                if not target.paragraphs: target.add_paragraph()
                column+=span
        return
    if kind in {"bulletList","orderedList","listItem","blockquote"}:
        style="List Bullet" if kind=="bulletList" else "List Number" if kind=="orderedList" else list_style
        for child in node.get("content",[]): export_node(container,child,style)
        return
    style="Heading "+str(attrs.get("level",1)) if kind=="heading" else list_style or "Normal"
    paragraph=container.add_paragraph(style=style)
    paragraph.alignment={"left":WD_ALIGN_PARAGRAPH.LEFT,"center":WD_ALIGN_PARAGRAPH.CENTER,"right":WD_ALIGN_PARAGRAPH.RIGHT,"justify":WD_ALIGN_PARAGRAPH.JUSTIFY}.get(attrs.get("textAlign"))
    for child in node.get("content",[]):
        if child["type"]=="hardBreak": paragraph.add_run().add_break(); continue
        run=paragraph.add_run(child.get("text","")); marks={m["type"]:m.get("attrs") or {} for m in child.get("marks",[])}
        run.bold="bold" in marks; run.italic="italic" in marks; run.underline="underline" in marks; run.font.strike="strike" in marks
        if "code" in marks: run.font.name="Consolas"
        if "link" in marks:
            href=marks["link"]["href"]; rel=paragraph.part.relate_to(href,RT.HYPERLINK,is_external=True)
            link=OxmlElement("w:hyperlink"); link.set(qn("r:id"),rel); link.append(run._r); paragraph._p.append(link)
