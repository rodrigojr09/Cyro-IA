"""OpenAI-compatible Cloud adapter. Holds only the individual device credential."""

import os
import contextvars
import time
from types import SimpleNamespace
from urllib.parse import urlparse

from openai import AsyncOpenAI, APIStatusError, APITimeoutError, APIConnectionError

_client = None
_storage_origin = None
_storage_credential = None
_account_cache = None
_account_cached_at = 0.0
stream_sink = contextvars.ContextVar("jarvis_stream_sink", default=None)
memory_context = contextvars.ContextVar("cyro_memory_context", default=None)


def configure(origin, credential):
    global _client, _storage_origin, _storage_credential, _account_cache, _account_cached_at
    parsed = urlparse(origin)
    local_dev = (
        not getattr(__import__("sys"), "frozen", False)
        and parsed.hostname == "localhost"
        and parsed.scheme == "http"
    )
    if (
        (parsed.scheme != "https" and not local_dev)
        or parsed.username
        or parsed.password
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Origem Cloud inválida.")
    import re

    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", credential):
        raise ValueError("Credencial inválida.")
    _client = AsyncOpenAI(
        api_key=credential,
        base_url=origin.rstrip("/") + "/api/v1",
        timeout=100,
        max_retries=0,
    )
    _storage_origin = origin.rstrip("/")
    _storage_credential = credential
    _account_cache = None
    _account_cached_at = 0.0


def conversation_request(command):
    """Private backend transport; never expose the credential to the renderer."""
    import httpx
    from programming.security import ReadError

    if not _storage_origin or not _storage_credential:
        raise ReadError("Entre no Cyro com sua conta.")
    attempts = 1 if command.get("action") == "clear" else 2
    for attempt in range(attempts):
        try:
            response = httpx.post(
                _storage_origin + "/api/device/chats",
                headers={"Authorization": "Bearer " + _storage_credential},
                json=command,
                timeout=20,
                follow_redirects=False,
            )
            if response.status_code in (401, 403):
                raise ReadError("Sessão encerrada. Entre novamente no Cyro.")
            if response.status_code == 507:
                from local_storage import StorageFullError

                raise StorageFullError()
            if response.status_code == 404:
                raise ReadError(
                    "Conversa indisponível. Atualize o Cloud e confira sua conta."
                )
            if response.status_code == 400:
                raise ReadError("Conversa inexistente, arquivada ou operação inválida.")
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            if attempt == attempts - 1:
                raise ReadError(
                    "Não foi possível acessar os chats na nuvem. Verifique a conexão e tente novamente."
                ) from None


def ready():
    return _client is not None


async def attachment_identity():
    import httpx
    import uuid
    import hashlib
    from programming.security import ReadError

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as transport:
            response = await transport.get(
                _storage_origin + "/api/device/session",
                headers={"Authorization": "Bearer " + _storage_credential},
            )
            response.raise_for_status()
            payload = response.json()
            user_id = str(uuid.UUID(payload["user"]["id"]))
            if payload.get("active") is not True:
                raise ValueError
            return hashlib.sha256(
                (_storage_origin + ":" + user_id).encode()
            ).hexdigest()
    except Exception:
        raise ReadError(
            "Não foi possível validar a conta para os anexos locais. Entre novamente."
        ) from None


async def account_capabilities():
    """Short-lived display/transport cache. The API revalidates every AI request."""
    global _account_cache, _account_cached_at
    if not _storage_origin or not _storage_credential:
        return None
    if _account_cache is not None and time.monotonic() - _account_cached_at < 30:
        return _account_cache
    import httpx
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as transport:
        response = await transport.get(_storage_origin + "/api/account", headers={"Authorization": "Bearer " + _storage_credential})
        if response.status_code == 404:
            return None  # Compatibility with the previously deployed API.
        response.raise_for_status()
        _account_cache = response.json()
        _account_cached_at = time.monotonic()
        return _account_cache


COMMERCIAL_ERRORS = {
    "DAILY_QUOTA_EXCEEDED": "Limite diário atingido. A renovação ocorre às 00:00 UTC.",
    "PLAN_FEATURE_REQUIRED": "Este recurso não está incluído no seu plano. Consulte sua conta.",
    "PLAN_TOOLS_BLOCKED": "Ferramentas não incluídas no plano atual.",
    "PLAN_IMAGES_BLOCKED": "Análise de imagens exige um plano com esse recurso.",
    "INPUT_TOKEN_LIMIT": "Mensagem e anexos ultrapassam a entrada permitida. Reduza o conteúdo.",
    "REQUEST_TOKEN_LIMIT": "Orçamento da solicitação excedido. Reduza o conteúdo.",
    "PLATFORM_BUDGET_EXCEEDED": "Limite da plataforma atingido. Tente novamente após a renovação.",
    "PLATFORM_PAUSED": "As operações de IA estão temporariamente suspensas.",
    "TARIFF_UNAVAILABLE": "O modelo aguarda configuração de tarifa pelo administrador.",
    "ACCOUNT_RESTRICTED": "O consumo da conta aguarda revisão administrativa.",
    "AI_REQUEST_ALREADY_RESERVED": "Esta operação já foi enviada. Consulte o histórico antes de tentar novamente.",
}

class CloudAccountError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status_code = status

async def request_completion(**kwargs):
    try:
        return await _client.chat.completions.create(**kwargs)
    except APIStatusError as exc:
        code = exc.body.get("code") if isinstance(exc.body, dict) else None
        if code in COMMERCIAL_ERRORS:
            raise CloudAccountError(exc.status_code, COMMERCIAL_ERRORS[code]) from None
        raise


class Completions:
    async def create(self, **kwargs):
        if _client is None:
            raise RuntimeError("Entre no Cyro com sua conta.")
        account = await account_capabilities()
        if account and account.get("commercialEnabled"):
            plan = account["plan"]
            kwargs["max_completion_tokens"] = min(kwargs.get("max_completion_tokens", plan["outputTokens"]), plan["outputTokens"])
            if not plan.get("features", {}).get("tools"):
                for field in ("tools", "tool_choice", "parallel_tool_calls"):
                    kwargs.pop(field, None)
        # SDK response-only annotations/refusal fields must not break the next tool round.
        allowed = {"role", "content", "tool_call_id", "tool_calls"}
        kwargs["messages"] = [
            {key: value for key, value in message.items() if key in allowed}
            for message in kwargs["messages"]
        ]
        sink = stream_sink.get()
        scope = memory_context.get()
        if scope:
            kwargs["extra_body"] = {**(kwargs.get("extra_body") or {}), "memory_context": scope}
        if sink is None:
            return await request_completion(**kwargs)
        from openai.types.chat import ChatCompletion

        stream = await request_completion(**kwargs, stream=True)
        text, calls, usage, identifier = "", {}, None, "cloud-stream"
        try:
            async for chunk in stream:
                identifier = chunk.id
                if chunk.usage:
                    usage = chunk.usage.model_dump()
                for choice in chunk.choices:
                    delta = choice.delta
                    if delta.content:
                        text += delta.content
                        await sink(delta.content)
                    for tool in delta.tool_calls or []:
                        value = calls.setdefault(
                            tool.index,
                            {
                                "id": "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            },
                        )
                        if tool.id:
                            value["id"] = tool.id
                        if tool.function:
                            value["function"]["name"] += tool.function.name or ""
                            value["function"]["arguments"] += (
                                tool.function.arguments or ""
                            )
        finally:
            await stream.close()
        message = {"role": "assistant", "content": text or None}
        if calls:
            message["tool_calls"] = [calls[key] for key in sorted(calls)]
        return ChatCompletion.model_validate(
            {
                "id": identifier,
                "object": "chat.completion",
                "created": int(time.time()),
                "model": kwargs["model"],
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "tool_calls" if calls else "stop",
                        "message": message,
                    }
                ],
                "usage": usage,
            }
        )


class CloudSpeechError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# Only messages authored by our Cloud may be displayed; never expose raw SDK errors.
SPEECH_MESSAGES = {
    "Limite de memória na nuvem atingido. Apague alguns chats para liberar memória e continuar usando o Cyro.",
    "Voz não habilitada pelo administrador.",
    "Chave OpenAI não configurada no Cloud.",
    "Inteligência artificial suspensa.",
    "Sessão inválida ou acesso bloqueado. Entre novamente.",
    "Entre para continuar.",
    "Funcionário inativo.",
    "Limite mensal de tokens atingido.",
    "Muitas tentativas. Aguarde.",
    "Dados inválidos.",
    "Síntese de voz indisponível.",
    "Configuração de voz recusada pela OpenAI. Contate o administrador.",
    "Limite ou saldo da OpenAI indisponível para voz. Contate o administrador.",
    "A síntese de voz demorou demais. Tente novamente.",
}


class Speech:
    async def create(self, **kwargs):
        if _client is None:
            raise RuntimeError("Entre para continuar.")
        try:
            return await _client.audio.speech.create(**kwargs)
        except APIStatusError as exc:
            code = exc.body.get("code") if isinstance(exc.body, dict) else None
            message = COMMERCIAL_ERRORS.get(code) or (exc.body.get("error") if isinstance(exc.body, dict) else exc.body)
            if not isinstance(message, str) or message not in SPEECH_MESSAGES and message not in COMMERCIAL_ERRORS.values():
                message = "Serviço de voz indisponível no Cloud. Tente novamente."
            status = (
                exc.status_code
                if exc.status_code in {400, 401, 403, 429, 502, 503, 504, 507}
                else 502
            )
            raise CloudSpeechError(status, message) from exc
        except APITimeoutError as exc:
            raise CloudSpeechError(
                504, "A síntese de voz demorou demais. Tente novamente."
            ) from exc
        except APIConnectionError as exc:
            raise CloudSpeechError(
                503, "Sem conexão com o Cloud para gerar áudio."
            ) from exc


client = SimpleNamespace(
    chat=SimpleNamespace(completions=Completions()),
    audio=SimpleNamespace(speech=Speech()),
)
