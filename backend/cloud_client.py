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
stream_sink = contextvars.ContextVar("jarvis_stream_sink", default=None)


def configure(origin, credential):
    global _client, _storage_origin, _storage_credential
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


def conversation_request(command):
    """Private backend transport; never expose the credential to the renderer."""
    import httpx
    from programming.security import ReadError

    if not _storage_origin or not _storage_credential:
        raise ReadError("Entre no JARVIS com sua conta.")
    for attempt in range(2):
        try:
            response = httpx.post(
                _storage_origin + "/api/device/chats",
                headers={"Authorization": "Bearer " + _storage_credential},
                json=command,
                timeout=20,
                follow_redirects=False,
            )
            if response.status_code in (401, 403):
                raise ReadError("Sessão encerrada. Entre novamente no JARVIS.")
            if response.status_code == 404:
                raise ReadError(
                    "Conversa indisponível. Atualize o Cloud e confira sua conta."
                )
            if response.status_code == 400:
                raise ReadError("Conversa inexistente, arquivada ou operação inválida.")
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            if attempt:
                raise ReadError(
                    "Não foi possível acessar os chats na nuvem. Verifique a conexão e tente novamente."
                ) from None


def ready():
    return _client is not None


class Completions:
    async def create(self, **kwargs):
        if _client is None:
            raise RuntimeError("Entre no JARVIS com sua conta.")
        # SDK response-only annotations/refusal fields must not break the next tool round.
        allowed = {"role", "content", "tool_call_id", "tool_calls"}
        kwargs["messages"] = [
            {key: value for key, value in message.items() if key in allowed}
            for message in kwargs["messages"]
        ]
        sink = stream_sink.get()
        if sink is None:
            return await _client.chat.completions.create(**kwargs)
        from openai.types.chat import ChatCompletion

        stream = await _client.chat.completions.create(**kwargs, stream=True)
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
            message = exc.body.get("error") if isinstance(exc.body, dict) else exc.body
            if not isinstance(message, str) or message not in SPEECH_MESSAGES:
                message = "Serviço de voz indisponível no Cloud. Tente novamente."
            status = (
                exc.status_code
                if exc.status_code in {400, 401, 403, 429, 502, 503, 504}
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
