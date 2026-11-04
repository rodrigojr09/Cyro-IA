"""ASGI + actual Cloud adapter + persistent local store, provider stream mocked."""

import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from openai.types.chat import ChatCompletionChunk
import cloud_client
import main
import test_jarvis as legacy


class CloudIntegrationTests(unittest.TestCase):
    def setUp(self):
        legacy.JarvisTests.setUp(self)

    def tearDown(self):
        cloud_client._client = None
        legacy.JarvisTests.tearDown(self)

    def test_stream_delivers_deltas_and_persists_completed_history(self):
        class Stream:
            def __aiter__(self):
                async def values():
                    yield ChatCompletionChunk.model_validate(
                        {
                            "id": "stream-test",
                            "object": "chat.completion.chunk",
                            "created": 1,
                            "model": "test",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": "Olá"},
                                    "finish_reason": None,
                                }
                            ],
                        }
                    )
                    yield ChatCompletionChunk.model_validate(
                        {
                            "id": "stream-test",
                            "object": "chat.completion.chunk",
                            "created": 1,
                            "model": "test",
                            "choices": [],
                            "usage": {
                                "prompt_tokens": 2,
                                "completion_tokens": 1,
                                "total_tokens": 3,
                            },
                        }
                    )

                return values()

            async def close(self):
                pass

        cloud_client._client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(create=AsyncMock(return_value=Stream()))
            )
        )
        with patch.object(main, "CLOUD", True), patch.object(
            main, "client", cloud_client.client
        ), patch.object(
            main.store, "request", return_value={"blocked": False}, create=True
        ):
            response = self.client.post(
                "/chat/stream", json={"message": "Escreva uma saudação de teste.", "chat_id": main.store.create_chat()["id"]}
            )
            self.assertEqual(response.status_code, 200)
            events = [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: ")
            ]
            self.assertEqual("".join(event.get("delta", "") for event in events), "Olá")
            result = events[-1]["result"]
            self.assertEqual(result["reply"], "Olá")
            history = self.client.get(
                "/chats/history", params={"chat_id": result["chat_id"]}
            ).json()
            self.assertTrue(
                any(item["content"] == "Olá" for item in history["messages"])
            )

    def test_renderer_cannot_supply_private_cloud_session_without_local_token(self):
        with patch.object(main, "CLOUD", True):
            response = self.client.post(
                "/desktop/cloud-session",
                headers={"X-Jarvis-Token": ""},
                json={"origin": "https://example.test", "credential": "a" * 43},
            )
            self.assertEqual(response.status_code, 401)

    def test_speech_preserves_safe_cloud_errors_and_hides_unknown_details(self):
        import httpx
        from openai import AsyncOpenAI

        for status, payload, expected in [
            (
                503,
                "Voz não habilitada pelo administrador.",
                "Voz não habilitada pelo administrador.",
            ),
            (
                429,
                "Limite mensal de tokens atingido.",
                "Limite mensal de tokens atingido.",
            ),
            (
                403,
                "Sessão inválida ou acesso bloqueado. Entre novamente.",
                "Sessão inválida ou acesso bloqueado. Entre novamente.",
            ),
            (
                503,
                "private-provider-data",
                "Serviço de voz indisponível no Cloud. Tente novamente.",
            ),
        ]:
            with self.subTest(status=status, payload=payload):
                transport = httpx.MockTransport(
                    lambda request: httpx.Response(status, json={"error": payload})
                )
                sdk = AsyncOpenAI(
                    api_key="test-device-only",
                    base_url="https://cloud.example.test/api/v1",
                    max_retries=0,
                    http_client=httpx.AsyncClient(transport=transport),
                )
                with patch.object(cloud_client, "_client", sdk), patch.object(
                    main, "CLOUD", True
                ), patch.object(main, "client", cloud_client.client):
                    response = self.client.post(
                        "/speak", json={"message": "Teste de voz"}
                    )
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()["detail"], expected)
                self.assertNotIn("private-provider-data", response.text)


if __name__ == "__main__":
    unittest.main()
