"""OpenAI-compatible Cloud adapter. Holds only the individual device credential."""

import os
import contextvars
import time
from types import SimpleNamespace
from urllib.parse import urlparse

from openai import AsyncOpenAI

_client = None
stream_sink = contextvars.ContextVar("jarvis_stream_sink", default=None)


def configure(origin, credential):
    global _client
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


def ready():
    return _client is not None


class Completions:
    async def create(self, **kwargs):
        if _client is None:
            raise RuntimeError("Ative o JARVIS pelo link fornecido pelo administrador.")
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


class Speech:
    async def create(self, **kwargs):
        if _client is None:
            raise RuntimeError("Ativação necessária.")
        return await _client.audio.speech.create(**kwargs)


client = SimpleNamespace(
    chat=SimpleNamespace(completions=Completions()),
    audio=SimpleNamespace(speech=Speech()),
)
