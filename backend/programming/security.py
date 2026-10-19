"""Fronteira de leitura: autorizações explícitas, caminhos e texto sanitizado."""
import os
import re
import stat
import unicodedata
from pathlib import Path, PureWindowsPath

IGNORED = {'.git', '.next', 'node_modules', 'dist', 'build', 'coverage', '.venv',
           'venv', '__pycache__', '.idea', '.vscode', '.ssh', '.aws', '.azure', '.config',
           '.cache', '.turbo', 'vendor', 'target', '.nuxt', '.output', '.pytest_cache'}
EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyi', '.json',
              '.md', '.txt', '.toml', '.yaml', '.yml', '.html', '.css', '.scss', '.sql',
              '.vue', '.svelte', '.prisma', '.graphql', '.gql', '.rs', '.go', '.java',
              '.cs', '.cpp', '.c', '.h', '.rb', '.php', '.xml', '.ini', '.cfg'}
PLAIN_NAMES = {'dockerfile', 'makefile', 'requirements.txt', '.gitignore'}
SECRET_NAMES = re.compile(r'(^\.env|credential|secret|token|password|passwd|^id_(rsa|dsa|ecdsa|ed25519)|'
                          r'^\.?(npmrc|pypirc|netrc|local-token)|service[-_]?account|^\.programming-)')
SECRET_EXTENSIONS = {'.pem', '.key', '.ppk', '.p12', '.pfx', '.crt', '.cer', '.db', '.sqlite', '.sqlite3',
                     '.log', '.bak', '.dump', '.kdbx', '.keystore', '.jks'}
MAX_FILE_BYTES = 128 * 1024
MAX_LINE_CHARS = 1000
MAX_READ_CHARS = 12000


class ReadError(ValueError):
    """Erro seguro para devolver ao usuário/IA sem detalhes da exceção do SO."""


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))


def sensitive(name):
    lowered = name.casefold()
    return bool(SECRET_NAMES.search(lowered)) or Path(lowered).suffix in SECRET_EXTENSIONS or any(
        suffix in lowered for suffix in ('.sqlite3-', '.sqlite-', '.db-'))


def readable_name(name):
    return not sensitive(name) and (Path(name).suffix.casefold() in EXTENSIONS or name.casefold() in PLAIN_NAMES)


def redact(text):
    # Defesa adicional para segredos embutidos em arquivos de código/configuração.
    text = re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?(?:-----END [^-]*PRIVATE KEY-----|\Z)',
                  '[CHAVE PRIVADA REMOVIDA]', text, flags=re.S)
    text = re.sub(r'\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{15,}|'
                  r'github_pat_[A-Za-z0-9_]{15,}|AKIA[A-Z0-9]{16}|'
                  r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b', '[SEGREDO REMOVIDO]', text)
    assignment = (r'[\w"\x27.-]*(?:api[_-]?key|private[_-]?key|secret|token|password|passwd|credential|'
                  r'database[_-]?url|connection[_-]?string)[\w"\x27.-]*\s*[:=]\s*')
    # Preserva aspas/vírgulas de manifests JSON, inclusive quando um nome de biblioteca contém "token".
    text = re.sub(r'(?im)(' + assignment + r')(["\x27])([^\r\n]*?)\2',
                  lambda match: match[1] + match[2] + '[VALOR REMOVIDO]' + match[2], text)
    text = re.sub(r'(?im)(' + assignment + r')(?!\s*["\x27])[^,;\r\n}]+', r'\1"[VALOR REMOVIDO]"', text)
    text = re.sub(r'(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s"\x27]+',
                  '[CONEXÃO REMOVIDA]', text)
    return text


class ReadPolicy:
    def __init__(self, roots=()):
        self.roots = []
        for root in roots:
            try:
                self.authorize(root)
            except ReadError:
                pass

    def authorize(self, value):
        text = str(value)
        if not Path(text).is_absolute() or text.startswith(('\\\\', '//')):
            raise ReadError('Selecione uma pasta local com caminho absoluto.')
        try:
            path = Path(text).resolve(strict=True)
            if not path.is_dir() or path == Path(path.anchor):
                raise ReadError('Autorize uma pasta específica, não uma unidade inteira.')
        except OSError:
            raise ReadError('Pasta inexistente ou sem permissão de leitura.') from None
        if any(sensitive(part) or part.casefold() in IGNORED for part in path.parts):
            raise ReadError('Esta pasta é protegida pela política de leitura.')
        if path not in self.roots:
            if len(self.roots) >= 10:
                raise ReadError('Limite de 10 pastas autorizadas atingido.')
            self.roots.append(path)
        return path

    def resolve(self, value, base=None):
        text = str(value).replace('\\', '/')
        windows = PureWindowsPath(str(value))
        if not text or '\x00' in text or '..' in text.split('/') or text.startswith('//'):
            raise ReadError('Caminho não permitido.')
        if ':' in text[2:] or (':' in text and not windows.drive):
            raise ReadError('Caminho especial não permitido.')
        # Caminhos C:arquivo dependem do diretório da unidade e não são absolutos.
        if windows.drive and not windows.is_absolute():
            raise ReadError('Informe um caminho absoluto ou relativo ao projeto.')
        path = Path(text)
        if not path.is_absolute():
            if base is None:
                raise ReadError('Selecione um projeto ou informe um caminho autorizado.')
            path = Path(base) / path
        path = Path(os.path.abspath(path))
        root = next((root for root in self.roots if path.is_relative_to(root)), None)
        if root is None:
            raise ReadError('Caminho fora das pastas autorizadas. Use Autorizar pasta na interface.')
        try:
            # Bloqueia todos os links/junctions abaixo da raiz, inclusive os internos.
            cursor = root
            for part in ('.', *path.relative_to(root).parts):
                if part != '.':
                    if part.casefold() in IGNORED or sensitive(part):
                        raise ReadError('Arquivo ou diretório protegido.')
                    cursor = cursor / part
                info = cursor.lstat()
                if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
                    raise ReadError('Links simbólicos e pontos de redirecionamento não são permitidos.')
            resolved = path.resolve(strict=True)
            if not resolved.is_relative_to(root):
                raise ReadError('Caminho fora da pasta autorizada.')
        except (OSError, RuntimeError):
            raise ReadError('Arquivo inexistente ou sem permissão de leitura.') from None
        return resolved

    def text(self, value, base=None):
        path = self.resolve(value, base)
        if not readable_name(path.name):
            raise ReadError('Tipo de arquivo não permitido para leitura de código.')
        try:
            info = path.stat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE_BYTES or info.st_nlink > 1:
                raise ReadError('Arquivo não regular, com hard links ou maior que 128 KiB.')
            # Modo rb é a única abertura de arquivos de projetos usada pelo leitor.
            with path.open('rb') as handle:
                # Revalida após abrir para detectar troca por link entre validação e leitura.
                self.resolve(path)
                opened = os.fstat(handle.fileno())
                if (opened.st_ino, opened.st_dev) != (info.st_ino, info.st_dev):
                    raise ReadError('Arquivo alterado durante a leitura; tente novamente.')
                raw = handle.read(MAX_FILE_BYTES + 1)
            if len(raw) > MAX_FILE_BYTES or b'\x00' in raw:
                raise ReadError('Arquivo binário ou maior que o limite.')
            text = raw.decode('utf-8-sig')
        except (OSError, UnicodeError):
            raise ReadError('Arquivo sem permissão ou não é texto UTF-8.') from None
        return path, redact(text)

    def read(self, value, base=None, start_line=1, end_line=160):
        path, text = self.text(value, base)
        lines = text.splitlines()
        if start_line < 1 or end_line < start_line or end_line - start_line >= 200:
            raise ReadError('Solicite de 1 a 200 linhas por leitura.')
        result, used = [], 0
        for number in range(start_line, min(end_line, len(lines)) + 1):
            line = f'{number}: {lines[number - 1][:MAX_LINE_CHARS]}'
            if used + len(line) + 1 > MAX_READ_CHARS:
                break
            result.append(line)
            used += len(line) + 1
        return {'path': str(path), 'start_line': start_line, 'end_line': start_line + len(result) - 1,
                'total_lines': len(lines), 'content': '\n'.join(result),
                'truncated': len(result) < max(0, len(lines) - start_line + 1) or
                             any(len(line) > MAX_LINE_CHARS for line in lines[start_line - 1:end_line]),
                'untrusted_content': True}
