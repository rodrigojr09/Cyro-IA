import asyncio
import unittest
from unittest.mock import AsyncMock, patch
import cloud_client


class CloudAdapterTests(unittest.TestCase):
    def test_stream_keeps_tool_arguments_and_usage(self):
        from types import SimpleNamespace
        from openai.types.chat import ChatCompletionChunk

        class Stream:
            def __aiter__(self):
                async def chunks():
                    for delta, usage in [
                        ({"content": "Olá"}, None),
                        (
                            {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "id": "call_test",
                                        "type": "function",
                                        "function": {
                                            "name": "list_projects",
                                            "arguments": "{}",
                                        },
                                    }
                                ]
                            },
                            None,
                        ),
                        (
                            {},
                            {
                                "prompt_tokens": 3,
                                "completion_tokens": 2,
                                "total_tokens": 5,
                            },
                        ),
                    ]:
                        yield ChatCompletionChunk.model_validate(
                            {
                                "id": "test",
                                "object": "chat.completion.chunk",
                                "created": 1,
                                "model": "test",
                                "choices": [
                                    {"index": 0, "delta": delta, "finish_reason": None}
                                ],
                                "usage": usage,
                            }
                        )

                return chunks()

            async def close(self):
                pass

        async def run():
            deltas = []

            async def emit(value):
                deltas.append(value)

            marker = cloud_client.stream_sink.set(emit)
            cloud_client._client = SimpleNamespace(
                chat=SimpleNamespace(
                    completions=SimpleNamespace(create=AsyncMock(return_value=Stream()))
                )
            )
            try:
                result = await cloud_client.client.chat.completions.create(
                    model="test", messages=[]
                )
                self.assertEqual(result.choices[0].message.content, "Olá")
                self.assertEqual(
                    result.choices[0].message.tool_calls[0].function.name,
                    "list_projects",
                )
                self.assertEqual(result.usage.total_tokens, 5)
                self.assertEqual(deltas, ["Olá"])
            finally:
                cloud_client.stream_sink.reset(marker)

        asyncio.run(run())

    def tearDown(self):
        cloud_client._client = None

    def test_refuses_insecure_or_redirected_origin(self):
        for origin in [
            "http://example.test",
            "https://user:pass@example.test",
            "https://example.test/path",
            "https://example.test?secret=value",
        ]:
            with self.assertRaises(ValueError):
                cloud_client.configure(origin, "a" * 43)

    def test_activation_required(self):
        with self.assertRaises(RuntimeError):
            asyncio.run(
                cloud_client.client.chat.completions.create(model="test", messages=[])
            )

    def test_response_only_fields_do_not_leak_into_next_tool_request(self):
        sender = AsyncMock(return_value="mock-result")
        from types import SimpleNamespace

        cloud_client._client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=sender))
        )
        original = {
            "role": "assistant",
            "tool_calls": [],
            "annotations": [],
            "refusal": None,
        }
        asyncio.run(
            cloud_client.client.chat.completions.create(
                model="test", messages=[original]
            )
        )
        self.assertEqual(
            sender.call_args.kwargs["messages"],
            [{"role": "assistant", "tool_calls": []}],
        )
        self.assertIn("annotations", original)

    def test_only_cloud_device_credential_is_used(self):
        with patch.object(cloud_client, "AsyncOpenAI") as factory:
            factory.return_value.chat.completions.create = AsyncMock(
                return_value="mock-result"
            )
            cloud_client.configure("https://jarvis.example.test", "a" * 43)
            self.assertEqual(
                factory.call_args.kwargs["base_url"],
                "https://jarvis.example.test/api/v1",
            )
            self.assertEqual(factory.call_args.kwargs["api_key"], "a" * 43)
            self.assertEqual(
                asyncio.run(
                    cloud_client.client.chat.completions.create(
                        model="test", messages=[]
                    )
                ),
                "mock-result",
            )


if __name__ == "__main__":
    unittest.main()
