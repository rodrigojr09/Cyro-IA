"""Descoberta limitada e análise estática; nunca importa ou executa o projeto."""
import json
import os
import time
from pathlib import Path

from .security import IGNORED, ReadError, normalized, readable_name, sensitive, generated

MAX_ENTRIES = 2000
MAX_DEPTH = 6
MAX_SECONDS = 3
MARKERS = {'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'Cargo.toml', 'go.mod'}
ALIASES = {'area de trabalho': 'desktop', 'desktop': 'desktop', 'documentos': 'documents',
           'documents': 'documents', 'downloads': 'downloads'}


def walk(policy, directory, depth=MAX_DEPTH, max_entries=MAX_ENTRIES, deadline=None):
    """Retorna metadados de no máximo 2000 entradas, até 6 níveis e 3 segundos."""
    root = policy.resolve(directory)
    if not root.is_dir():
        raise ReadError('O caminho não é um diretório.')
    stack, entries, visited, skipped = [(root, 0)], [], 0, 0
    deadline = deadline if deadline is not None else time.monotonic() + MAX_SECONDS
    truncated = False
    while stack and visited < max_entries and time.monotonic() < deadline:
        folder, level = stack.pop()
        try:
            folder = policy.resolve(folder)
            with os.scandir(folder) as iterator:
                for entry in iterator:
                    visited += 1
                    if visited > max_entries or time.monotonic() >= deadline:
                        truncated = True
                        break
                    if entry.name.casefold() in IGNORED or sensitive(entry.name) or generated(entry.name):
                        continue
                    if hasattr(policy,'allows_path') and not policy.allows_path(entry.path,navigate=True):
                        continue
                    try:
                        path = policy.resolve(entry.path)
                        is_dir = path.is_dir()
                    except (OSError, ReadError):
                        skipped += 1
                        continue
                    if is_dir or readable_name(entry.name):
                        entries.append({'path': str(path), 'relative_path': path.relative_to(root).as_posix(),
                                        'name': entry.name, 'type': 'directory' if is_dir else 'file'})
                    if is_dir:
                        if level < depth:
                            stack.append((path, level + 1))
                        else:
                            truncated = True
        except (OSError, ReadError):
            skipped += 1
    if stack:
        truncated = True
    entries.sort(key=lambda item: item['relative_path'].casefold())
    return {'entries': entries, 'truncated': truncated, 'skipped': skipped, 'visited': min(visited, max_entries)}


def discover(policy, query=''):
    matches, truncated = {}, False
    # O orçamento de entradas é compartilhado pelas raízes desta operação.
    remaining = MAX_ENTRIES
    deadline = time.monotonic() + MAX_SECONDS
    for root in policy.roots:
        if remaining <= 0 or time.monotonic() >= deadline:
            truncated = True
            break
        listing = walk(policy, root, max_entries=remaining, deadline=deadline)
        remaining -= listing['visited']
        truncated |= listing['truncated']
        if not query or normalized(query) in normalized(root.name):
            matches[str(root)] = {'name': root.name, 'path': str(root), 'detected': False}
        for item in listing['entries']:
            path = Path(item['path'])
            if item['type'] == 'file' and path.name in MARKERS:
                project = path.parent
                if not query or normalized(query) in normalized(project.name):
                    matches[str(project)] = {'name': project.name, 'path': str(project), 'detected': True}
            elif query and item['type'] == 'directory' and normalized(query) == normalized(item['name']):
                matches[str(path)] = {'name': path.name, 'path': str(path), 'detected': False}
    return {'projects': list(matches.values())[:60], 'truncated': truncated or len(matches) > 60}


def project_candidates(policy, reference):
    ref = reference.strip().strip('"')
    plain = normalized(ref).replace('\\', '/')
    for alias, folder in sorted(ALIASES.items(), key=lambda pair: -len(pair[0])):
        if plain == alias or plain.startswith(alias + '/'):
            suffix = ref[len(alias):].lstrip('/\\')
            roots = [root for root in policy.roots if normalized(root.name) == folder]
            candidates = []
            for root in roots:
                try:
                    candidates.append(policy.resolve(root / suffix))
                except ReadError:
                    pass
            return candidates
    if Path(ref.replace('\\', '/')).is_absolute() or ':' in ref:
        return [policy.resolve(ref)]
    if '/' in plain:
        candidates = []
        for root in policy.roots:
            try:
                candidates.append(policy.resolve(ref, root))
            except ReadError:
                pass
        return candidates
    found = discover(policy, ref)['projects']
    exact = [item for item in found if normalized(item['name']) == normalized(ref)]
    return [Path(item['path']) for item in exact or found]


def project_root(policy, path):
    path = policy.resolve(path)
    if path.is_file():
        path = path.parent
    current = path
    while True:
        for marker in MARKERS:
            try:
                if policy.resolve(current / marker).is_file():
                    return current
            except ReadError:
                continue
        parent = current.parent
        if parent == current or not any(parent.is_relative_to(root) for root in policy.roots):
            return path
        current = parent


def analyze(policy, project, listing=None):
    listing = listing if listing is not None else walk(policy, project)
    files = [item['relative_path'] for item in listing['entries'] if item['type'] == 'file']
    technologies, manifests = set(), []
    # Leitura progressiva: somente até quatro manifests, jamais todo o projeto.
    candidates = sorted((item for item in files if Path(item).name in MARKERS),
                        key=lambda item: (item.count('/'), item))[:4]
    for relative in candidates:
        entry = {'path': relative}
        try:
            read = policy.read(relative, project, 1, 200)
            text = '\n'.join(line.partition(': ')[2] for line in read['content'].splitlines())
            if relative.endswith('package.json'):
                data = json.loads(text)
                deps = {**data.get('dependencies', {}), **data.get('devDependencies', {})}
                if not isinstance(deps, dict):
                    raise ValueError
                entry['dependencies'] = dict(list(deps.items())[:60])
                entry['truncated'] = len(deps) > 60
                technologies.add('Node.js')
                for name, label in [('next', 'Next.js'), ('react', 'React'), ('express', 'Express'), ('electron', 'Electron')]:
                    if name in deps:
                        technologies.add(label)
            else:
                entry['excerpt'] = text[:1800]
                if Path(relative).name in {'pyproject.toml', 'requirements.txt', 'setup.py'}:
                    technologies.add('Python')
                if 'fastapi' in text.casefold():
                    technologies.add('FastAPI')
        except (ReadError, ValueError, TypeError, AttributeError):
            entry['note'] = 'Manifesto indisponível, truncado ou não pôde ser interpretado com segurança.'
        manifests.append(entry)
    if any(path.endswith(('.py', '.pyi')) for path in files):
        technologies.add('Python')
    if any('prisma' in path.casefold() for path in files):
        technologies.add('Prisma')
    return {'project': {'name': Path(project).name, 'path': str(project)},
            'technologies': sorted(technologies), 'manifests': manifests,
            'entry_candidates': [path for path in files if Path(path).name in {
                'main.py', 'app.py', 'index.ts', 'index.js', 'main.ts', 'main.js', 'page.tsx', 'App.tsx'}][:30],
            'structure': files[:80], 'truncated': listing['truncated'] or len(files) > 80,
            'note': 'Detecção estática parcial. Dependências não garantem uso efetivo. Nenhum código foi executado.',
            'untrusted_content': True}
