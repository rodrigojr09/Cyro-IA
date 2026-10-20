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
        ):
            response = self.client.post(
                "/chat/stream", json={"message": "Escreva uma saudação de teste."}
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


if __name__ == "__main__":
    unittest.main()
