import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
import cloud_client
import spotify_commands
import main
import test_jarvis as legacy

class SpotifyCommandTests(unittest.TestCase):
    def test_candidate_voice_and_text(self):
        for text in ["Jarvis, próxima.", "pausa a música", "volume em 40%", "dispositivos Spotify"]:
            self.assertTrue(spotify_commands.candidate(text))
        for text in ["Explique Python", "x"*6001, None]:
            self.assertFalse(spotify_commands.candidate(text))
    def test_adapter_only_jarvis_session(self):
        post=AsyncMock(return_value=httpx.Response(200,json={"handled":True,"reply":"Faixa fixture", "speech":"Consulte o player."},request=httpx.Request("POST","https://jarvis.example.test")))
        context=AsyncMock();context.__aenter__.return_value=SimpleNamespace(post=post)
        with patch.object(cloud_client,"ready",return_value=True), patch.object(cloud_client,"_storage_origin","https://jarvis.example.test"),patch.object(cloud_client,"_storage_credential","session-fixture"),patch("httpx.AsyncClient",return_value=context):
            result=asyncio.run(spotify_commands.try_command("qual música está tocando?"))
        self.assertEqual(result["speech_text"],"Consulte o player.")
        self.assertEqual(post.call_args.args[0],"https://jarvis.example.test/api/integrations/spotify")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"],"Bearer session-fixture")
    def test_network_failure(self):
        with patch.object(cloud_client,"ready",return_value=True),patch("httpx.AsyncClient",side_effect=httpx.ConnectError("fixture")):
            result=asyncio.run(spotify_commands.try_command("pausa a música"))
        self.assertIn("Nenhum sucesso",result["reply"])
    def test_ai_tool_stops_before_metadata_reenters_model(self):
        from ai_tools import converse
        call=SimpleNamespace(id="music-tool",function=SimpleNamespace(name="spotify_control",arguments="{}"))
        sender=AsyncMock(return_value=legacy.completion(calls=[call]));client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=sender)))
        service=SimpleNamespace(tools=[],progress="")
        with patch.dict(os.environ,{"JARVIS_CLOUD":"1"}),patch("spotify_commands.try_command",AsyncMock(return_value={"reply":"Metadado fixture", "speech_text":"Resultado disponível."})):
            reply,_=asyncio.run(converse(client,"fixture",[{"role":"user","content":"qual música está tocando?"}],"programming",service))
        self.assertEqual(reply,"Metadado fixture");self.assertEqual(sender.await_count,1)
        self.assertNotIn("Metadado fixture",str(sender.call_args))

class SpotifyChatIntegrationTests(unittest.TestCase):
    def setUp(self): legacy.JarvisTests.setUp(self)
    def tearDown(self): legacy.JarvisTests.tearDown(self)
    def test_main_quick_voice_share_tool_without_history(self):
        result={"reply":"Faixa privada fixture", "speech_text":"Consulte o player.", "pending_actions":[], "spotify":True}
        with patch.object(cloud_client,"ready",return_value=True),patch.object(main,"CLOUD",True),patch.object(main.store,"request",return_value={"blocked":False},create=True),patch("spotify_commands.try_command",AsyncMock(return_value=result)) as tool:
            for route in ["/chat","/quick/chat"]:
                response=self.client.post(route,json={"message":"Jarvis, que música é essa?"})
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()["speech_text"],"Consulte o player.")
                self.assertNotIn("Faixa privada fixture",str(main.store.history(response.json()["chat_id"])))
            self.assertEqual(tool.await_count,2)

class SpotifyDeviceDialogueTests(unittest.TestCase):
    def setUp(self): spotify_commands._pending_devices.clear()
    def tearDown(self): spotify_commands._pending_devices.clear()
    def transport(self, values):
        async def answer(*args, **kwargs):
            return httpx.Response(200, json=values.pop(0), request=httpx.Request("POST","https://jarvis.example.test"))
        post=AsyncMock(side_effect=answer)
        context=AsyncMock();context.__aenter__.return_value=SimpleNamespace(post=post)
        return context,post
    def test_name_reply_keeps_original_resume_intent_and_no_device_data_is_cached(self):
        context,post=self.transport([{"handled":True,"reply":"Computador privado","devicePrompt":True,"resumeAfterSelection":True},{"handled":True,"reply":"Reprodução retomada"}])
        with patch.object(cloud_client,"ready",return_value=True),patch.object(cloud_client,"_storage_origin","https://jarvis.example.test"),patch.object(cloud_client,"_storage_credential","session-a"),patch("httpx.AsyncClient",return_value=context):
            asyncio.run(spotify_commands.try_command("continuar Spotify","chat-a"))
            self.assertNotIn("Computador privado",repr(spotify_commands._pending_devices));self.assertNotIn("session-a",repr(spotify_commands._pending_devices))
            result=asyncio.run(spotify_commands.try_command("Computador","chat-a"))
            self.assertEqual(result["reply"],"Reprodução retomada")
            self.assertEqual(post.call_args.kwargs["json"],{"operation":"chat","text":"Computador","selectDevice":True,"resumeAfterSelection":True})
            self.assertEqual(spotify_commands._pending_devices,{})
    def test_dialogue_is_scoped_to_chat_session_and_expiration(self):
        context,post=self.transport([{"handled":True,"reply":"Escolha","devicePrompt":True}])
        with patch.object(cloud_client,"ready",return_value=True),patch.object(cloud_client,"_storage_origin","https://jarvis.example.test"),patch.object(cloud_client,"_storage_credential","session-a"),patch("httpx.AsyncClient",return_value=context):
            asyncio.run(spotify_commands.try_command("dispositivos Spotify","chat-a"))
            self.assertIsNone(asyncio.run(spotify_commands.try_command("Computador","chat-b")))
            with patch.object(cloud_client,"_storage_credential","session-b"):
                self.assertIsNone(asyncio.run(spotify_commands.try_command("Computador","chat-a")))
            with patch("spotify_commands.time.monotonic",return_value=10**15):
                self.assertIsNone(asyncio.run(spotify_commands.try_command("Computador","chat-a")))
            self.assertEqual(post.await_count,1)
    def test_answer_without_action_clears_pending_question(self):
        context,post=self.transport([{"handled":True,"reply":"Escolha","devicePrompt":True},{"handled":False}])
        with patch.object(cloud_client,"ready",return_value=True),patch.object(cloud_client,"_storage_origin","https://jarvis.example.test"),patch.object(cloud_client,"_storage_credential","session-a"),patch("httpx.AsyncClient",return_value=context):
            asyncio.run(spotify_commands.try_command("dispositivos Spotify","chat-a"))
            self.assertIsNone(asyncio.run(spotify_commands.try_command("Obrigado","chat-a")))
            self.assertEqual(spotify_commands._pending_devices,{})

class SpotifyDeviceChatIntegrationTests(unittest.TestCase):
    def setUp(self):
        legacy.JarvisTests.setUp(self)
        spotify_commands._pending_devices.clear()
    def tearDown(self):
        spotify_commands._pending_devices.clear()
        legacy.JarvisTests.tearDown(self)
    def test_main_and_quick_accept_device_name_after_question_without_history(self):
        values=[]
        async def answer(*args,**kwargs):
            return httpx.Response(200,json=values.pop(0),request=httpx.Request("POST","https://jarvis.example.test"))
        post=AsyncMock(side_effect=answer)
        context=AsyncMock();context.__aenter__.return_value=SimpleNamespace(post=post)
        with patch.object(cloud_client,"ready",return_value=True),patch.object(cloud_client,"_storage_origin","https://jarvis.example.test"),patch.object(cloud_client,"_storage_credential","session-a"),patch("httpx.AsyncClient",return_value=context),patch.object(main,"CLOUD",True),patch.object(main.store,"request",return_value={"blocked":False},create=True):
            for route in ["/chat","/quick/chat"]:
                values.extend([{"handled":True,"reply":"Em qual aparelho? Computador privado","devicePrompt":True,"resumeAfterSelection":True},{"handled":True,"reply":"Retomada no aparelho escolhido"}])
                first=self.client.post(route,json={"message":"continuar Spotify"})
                self.assertEqual(first.status_code,200,first.text)
                body={"message":"Computador"}
                if route=="/chat": body["chat_id"]=first.json()["chat_id"]
                second=self.client.post(route,json=body)
                self.assertEqual(second.status_code,200,second.text)
                self.assertEqual(second.json()["reply"],"Retomada no aparelho escolhido")
                self.assertTrue(post.call_args.kwargs["json"]["selectDevice"])
                self.assertNotIn("Computador privado",str(main.store.history(first.json()["chat_id"])))

if __name__ == "__main__":
    unittest.main()
