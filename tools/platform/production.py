"""Read-only validation for existing VPS services and Vercel configuration."""
import ipaddress
import json
from urllib.parse import urlparse
from urllib.request import build_opener, HTTPRedirectHandler, Request

SERVER_KEYS = {"DATABASE_URL", "DIRECT_URL", "REDIS_URL", "AUTH_SECRET", "OPENAI_API_KEY", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_TOKEN_ENCRYPTION_KEY", "SERVICE_AUTH_SECRET", "SERVICE_CONTEXT_SECRET", "SIGNED_URL_SECRET", "CYRO_FILES_SERVICE_KEY", "CYRO_FILES_CONTEXT_SECRET", "CYRO_GITHUB_TOKEN", "CYRO_PUBLISHER_SECRET"}

def check_origin(value):
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.hostname.endswith((".invalid", ".example", ".test")):
        raise ValueError("Origem pública deve ser HTTPS, real, sem credenciais, caminhos ou parâmetros.")
    if value.endswith("/"): raise ValueError("Use a origem sem barra final.")
    return value

def private_host(host):
    if not host: return False
    try: return ipaddress.ip_address(host).is_private
    except ValueError: return "." not in host or host.endswith((".internal", ".local"))

def validate(backend, files, cloud):
    issues = []
    for label, env, required in [
        ("Backend", backend, ["DATABASE_URL", "REDIS_URL", "AUTH_SECRET", "APP_ORIGIN", "API_PUBLIC_ORIGIN", "CYRO_FILES_URL", "CYRO_FILES_APPLICATION_ID", "CYRO_FILES_SERVICE_KEY", "CYRO_FILES_CONTEXT_SECRET"]),
        ("Files", files, ["DATABASE_URL", "REDIS_URL", "STORAGE_PATH", "PUBLIC_URL", "SERVICE_AUTH_SECRET", "SERVICE_CONTEXT_SECRET", "SIGNED_URL_SECRET"]),
        ("Cloud", cloud, ["CYRO_BACKEND_ORIGIN"]),
    ]:
        for key in required:
            if not env.get(key) or "REPLACE" in env.get(key, "") or "<" in env.get(key, ""):
                issues.append(f"{label}: preencher {key} privadamente.")
    for label, value in [("Backend APP_ORIGIN", backend.get("APP_ORIGIN", "")), ("Cloud CYRO_BACKEND_ORIGIN", cloud.get("CYRO_BACKEND_ORIGIN", ""))]:
        try: check_origin(value)
        except ValueError: issues.append(f"{label}: exige origem pública HTTPS real.")
    try: check_origin(backend.get("API_PUBLIC_ORIGIN", ""))
    except ValueError: issues.append("Backend API_PUBLIC_ORIGIN: exige origem pública HTTPS real.")
    if backend.get("API_PUBLIC_ORIGIN", "").rstrip("/") != cloud.get("CYRO_BACKEND_ORIGIN", "").rstrip("/"):
        issues.append("API_PUBLIC_ORIGIN do Backend deve coincidir com CYRO_BACKEND_ORIGIN da Vercel.")
    for label, env in [("Backend", backend), ("Files", files)]:
        if env.get("NODE_ENV") != "production": issues.append(f"{label}: NODE_ENV deve ser production.")
        pg = urlparse(env.get("DATABASE_URL", ""))
        cache = urlparse(env.get("REDIS_URL", ""))
        if pg.scheme not in ("postgresql", "postgres") or not pg.hostname: issues.append(f"{label}: DATABASE_URL inválida.")
        elif not private_host(pg.hostname) and not any(x in pg.query for x in ("sslmode=require", "sslmode=verify-full", "sslmode=verify-ca")): issues.append(f"{label}: PostgreSQL externo exige TLS.")
        if cache.scheme not in ("redis", "rediss") or not cache.hostname: issues.append(f"{label}: REDIS_URL inválida.")
        elif cache.scheme == "redis" and not private_host(cache.hostname): issues.append(f"{label}: Redis externo exige rediss/TLS.")
    if backend.get("DATABASE_URL") and files.get("DATABASE_URL"):
        a, b = urlparse(backend["DATABASE_URL"]), urlparse(files["DATABASE_URL"])
        try:
            same = (a.hostname, a.port, a.path) == (b.hostname, b.port, b.path)
        except ValueError:
            same = False; issues.append("Porta de conexão PostgreSQL inválida.")
        if same: issues.append("Backend e Files devem usar bancos lógicos separados; não aplicar schemas no mesmo banco.")
    for key in ("AUTH_SECRET", "CYRO_FILES_SERVICE_KEY", "CYRO_FILES_CONTEXT_SECRET"):
        if len(backend.get(key, "")) < 32: issues.append(f"Backend: {key} precisa de pelo menos 32 caracteres.")
    for key in ("SERVICE_AUTH_SECRET", "SERVICE_CONTEXT_SECRET", "SIGNED_URL_SECRET"):
        if len(files.get(key, "")) < 32: issues.append(f"Files: {key} precisa de pelo menos 32 caracteres.")
    if len({files.get(k) for k in ("SERVICE_AUTH_SECRET", "SERVICE_CONTEXT_SECRET", "SIGNED_URL_SECRET")}) != 3: issues.append("Files: chave de serviço, contexto e assinatura precisam ser distintas.")
    for a, b in [("CYRO_FILES_SERVICE_KEY", "SERVICE_AUTH_SECRET"), ("CYRO_FILES_CONTEXT_SECRET", "SERVICE_CONTEXT_SECRET")]:
        if backend.get(a) != files.get(b): issues.append(f"Vínculo entre serviços divergente: Backend {a} / Files {b}.")
    if backend.get("CYRO_FILES_ISSUER", "cyro-backend") != files.get("TOKEN_ISSUER", "cyro-backend"): issues.append("Emissor do contexto Files divergente entre serviços.")
    if files.get("CORS_ORIGINS", "").strip(): issues.append("Files deve continuar exclusivo entre serviços; CORS_ORIGINS deve permanecer vazio.")
    for key in SERVER_KEYS:
        if cloud.get(key): issues.append(f"Cloud/Vercel: remover {key}; essa credencial pertence ao servidor.")
    for key in ("CYRO_FILES_URL",):
        value = urlparse(backend.get(key, ""))
        if value.username or value.password or value.scheme not in ("http", "https") or not value.hostname or (value.scheme == "http" and not private_host(value.hostname)):
            issues.append("CYRO_FILES_URL exige rede privada Docker ou HTTPS, sem credenciais na URL.")
    if "*" in backend.get("CORS_ORIGINS", ""): issues.append("Backend: CORS não pode usar curinga.")
    return issues

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_): return None

def probe(origin, service):
    origin = check_origin(origin)
    try:
        with build_opener(NoRedirect()).open(Request(origin + "/health", headers={"Accept": "application/json"}), timeout=10) as response:
            payload = json.loads(response.read(65536))
            if response.status != 200 or payload.get("service") != service or payload.get("status") != "ok": raise ValueError("Identidade de serviço não confirmada.")
    except Exception:
        raise ValueError(f"Saúde de {service} não confirmada; conferir domínio, proxy HTTPS e deploy.") from None
