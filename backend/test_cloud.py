import asyncio
import unittest
from unittest.mock import AsyncMock, patch
import cloud_client


class CloudAdapterTests(unittest.TestCase):
    def setUp(self):
        capabilities = patch.object(cloud_client, "account_capabilities", AsyncMock(return_value=None))
        capabilities.start()
        self.addCleanup(capabilities.stop)

    def test_memory_context_follows_current_request_and_is_not_shared_between_tasks(self):
        async def run():
            transport = AsyncMock()
            client = type("Client", (), {"chat": type("Chat", (), {"completions": type("Completions", (), {"create": transport})()})()})()
            with patch.object(cloud_client, "_client", client):
                marker = cloud_client.memory_context.set({"conversationId": "synthetic-conversation", "operationId": "synthetic-operation"})
                try:
                    await cloud_client.Completions().create(model="test", messages=[{"role": "user", "content": "Mensagem"}])
                    self.assertEqual(transport.call_args.kwargs["extra_body"]["memory_context"]["conversationId"], "synthetic-conversation")
                finally:
                    cloud_client.memory_context.reset(marker)
                await cloud_client.Completions().create(model="test", messages=[{"role": "user", "content": "Outra conversa"}])
                self.assertNotIn("extra_body", transport.call_args.kwargs)
                async def simultaneous(conversation):
                    scoped = cloud_client.memory_context.set({"conversationId": conversation})
                    try:
                        await asyncio.sleep(0)
                        await cloud_client.Completions().create(model="test", messages=[{"role": "user", "content": conversation}])
                    finally:
                        cloud_client.memory_context.reset(scoped)
                await asyncio.gather(simultaneous("first-chat"), simultaneous("second-chat"))
                concurrent = transport.call_args_list[-2:]
                for call in concurrent:
                    self.assertEqual(call.kwargs["messages"][0]["content"], call.kwargs["extra_body"]["memory_context"]["conversationId"])
                self.assertIsNone(cloud_client.memory_context.get())
        asyncio.run(run())

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


class CommercialTransportTest(__import__('unittest').IsolatedAsyncioTestCase):
    async def test_free_transport_omits_tools_and_caps_output_without_copying_credentials_to_payload(self):
        from unittest.mock import AsyncMock, patch
        import cloud_client
        from types import SimpleNamespace
        create = AsyncMock(return_value=SimpleNamespace(choices=[]))
        fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        with patch.object(cloud_client, '_client', fake), patch.object(cloud_client, 'account_capabilities', AsyncMock(return_value={'commercialEnabled': True, 'plan': {'outputTokens': 400, 'features': {'tools': False}}})):
            await cloud_client.Completions().create(model='test-model',messages=[{'role':'user','content':'oi'}],max_completion_tokens=3500,tools=[{'type':'function'}],tool_choice='auto')
        sent = create.call_args.kwargs
        self.assertEqual(sent['max_completion_tokens'],400)
        self.assertNotIn('tools',sent)
        self.assertNotIn('tool_choice',sent)

    async def test_quota_code_is_safe_and_actionable_without_private_http_body(self):
        import httpx
        from openai import APIStatusError
        response=httpx.Response(429,request=httpx.Request('POST','https://api.test/api/v1/chat/completions'))
        error=APIStatusError('private provider detail',response=response,body={'code':'DAILY_QUOTA_EXCEEDED','error':'private provider detail'})
        fake=__import__('types').SimpleNamespace(chat=__import__('types').SimpleNamespace(completions=__import__('types').SimpleNamespace(create=AsyncMock(side_effect=error))))
        with patch.object(cloud_client,'_client',fake):
            with self.assertRaises(cloud_client.CloudAccountError) as found:
                await cloud_client.request_completion(model='test',messages=[])
        self.assertEqual(found.exception.status_code,429)
        self.assertIn('00:00 UTC',str(found.exception))
        self.assertNotIn('private',str(found.exception))
