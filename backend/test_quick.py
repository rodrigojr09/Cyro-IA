import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
import main
import test_jarvis
from test_projects import make_project,register_selected
from project_store import ProjectStore,database


class QuickTests(unittest.TestCase):
    def setUp(self):test_jarvis.JarvisTests.setUp(self)
    def tearDown(self):test_jarvis.JarvisTests.tearDown(self)
    def ask(self,message='Olá',project_id=None,reply='Resposta direta.'):
        create=AsyncMock(return_value=test_jarvis.completion(reply))
        with patch.object(main.client.chat.completions,'create',create):response=self.client.post('/quick/chat',json={'message':message,'project_id':project_id})
        return response,create

    def project(self,name):
        item=register_selected(main.store,make_project(Path(self.temp.name)/name))
        main.store.update_project(item['id'],ready=1,state='ready')
        with database(main.store.db_path(item['id'])) as con:con.execute("INSERT INTO knowledge VALUES('IDEIA.md',?,1,'now')",('KNOWLEDGE_'+name,))
        return item

    def test_session_is_separate_persistent_and_restores_archived_chat(self):
        first=self.client.get('/quick/session').json()['chat_id']
        self.assertNotEqual(first,main.store.general_chat())
        self.assertEqual(self.client.get('/quick/session').json()['chat_id'],first)
        main.store.change_chat(first,archived=True)
        self.assertEqual(ProjectStore(main.DATA).quick_chat(),first)
        self.assertFalse(main.store.chat(first)['archived'])

    def test_short_prompt_is_sent_before_generation_without_truncating_answer(self):
        long='Explicação necessária. '*100
        response,create=self.ask(reply=long)
        self.assertEqual(response.status_code,200)
        sent=json.dumps(create.call_args.kwargs['messages'],ensure_ascii=False)
        self.assertIn('30 a 80 palavras',sent)
        self.assertIn('alertas importantes',sent)
        self.assertNotIn('tools',create.call_args.kwargs)
        self.assertEqual(response.json()['reply'],long)
        history=main.store.history(response.json()['chat_id'])
        self.assertEqual(history[-1]['content'],long)
        self.assertFalse(main.store.history(main.store.general_chat()))

    def test_context_requires_explicit_project_and_does_not_leak_between_scopes(self):
        a=self.project('Alpha');b=self.project('Beta')
        project_chat=main.store.create_chat(a['id'],'Privado')
        main.store.append(project_chat['id'],'user','PROJECT_PRIVATE_HISTORY')
        response,create=self.ask('Projeto ativo: Alpha',a['id'],reply='QUICK_ALPHA_REPLY')
        self.assertEqual(response.status_code,200)
        sent=json.dumps(create.call_args.kwargs['messages'])
        self.assertIn('KNOWLEDGE_Alpha',sent)
        self.assertNotIn('PROJECT_PRIVATE_HISTORY',sent)
        response,create=self.ask('Agora uma pergunta geral')
        sent=json.dumps(create.call_args.kwargs['messages'])
        self.assertNotIn('KNOWLEDGE_Alpha',sent);self.assertNotIn('QUICK_ALPHA_REPLY',sent)
        response,create=self.ask('Projeto Beta',b['id'])
        sent=json.dumps(create.call_args.kwargs['messages'])
        self.assertIn('KNOWLEDGE_Beta',sent);self.assertNotIn('QUICK_ALPHA_REPLY',sent)
        self.assertEqual(len(main.store.history(project_chat['id'])),1)

    def test_unconfirmed_project_rejected_before_ai_and_cannot_escalate_normal_chat(self):
        item=main.store.register(make_project(Path(self.temp.name)/'unconfirmed'))
        response,create=self.ask('Leia o projeto',item['id'])
        self.assertEqual(response.status_code,400);create.assert_not_called()
        general=main.store.create_chat(None)
        with patch.object(main.client.chat.completions,'create') as create:
            response=self.client.post('/chat',json={'chat_id':general['id'],'message':'Leia','quick_project_id':item['id']})
        self.assertEqual(response.status_code,400);create.assert_not_called()

    def test_api_failure_keeps_question_in_quick_history(self):
        with patch.object(main.client.chat.completions,'create',AsyncMock(side_effect=RuntimeError('simulated'))):
            response=self.client.post('/quick/chat',json={'message':'Pergunta preservada'})
        self.assertEqual(response.status_code,502)
        self.assertEqual(main.store.history(main.store.quick_chat())[-1]['content'],'Pergunta preservada')

    def test_existing_quick_conversation_opens_in_main_history(self):
        response,_=self.ask('Primeira pergunta')
        chat_id=response.json()['chat_id']
        history=self.client.get('/chats/history',params={'chat_id':chat_id}).json()
        self.assertIsNone(history['chat']['project_id'])
        self.assertEqual(history['messages'][0]['content'],'Primeira pergunta')
        response,create=self.ask('Continuação')
        self.assertIn('Primeira pergunta',json.dumps(create.call_args.kwargs['messages']))


if __name__=='__main__':unittest.main()
