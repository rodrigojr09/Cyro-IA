import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient

import computer
import main


def completion(content=None, calls=None):
    message = SimpleNamespace(content=content, tool_calls=calls)
    message.model_dump = lambda **_: {'role': 'assistant', 'content': content,
        'tool_calls': [{'id': c.id, 'type': 'function', 'function': {
            'name': c.function.name, 'arguments': c.function.arguments}} for c in calls or []]}
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class JarvisTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.patches = [patch.object(main, 'DB', root / 'test.sqlite3'),
                        patch.object(main, 'DATA', root / 'appdata'),
                        patch.object(main, 'ROOT', root),
                        patch.object(main, 'TOKEN_FILE', root / 'token'),
                        patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-key'})]
        for item in self.patches:
            item.start()
        computer.pending.clear()
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.client.headers['X-Jarvis-Token'] = main.SESSION_TOKEN

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def test_authentication_and_no_browser_cors(self):
        for route in ['/history', '/computer/system', '/computer/processes']:
            response = self.client.get(route, headers={'X-Jarvis-Token': ''})
            self.assertEqual(response.status_code, 401)
            self.assertNotIn('access-control-allow-origin', response.headers)
        self.assertEqual(self.client.get('/health', headers={'X-Jarvis-Token': ''}).status_code, 200)
        response = self.client.post('/action/confirm', headers={'X-Jarvis-Token': ''},
                                    json={'confirmation_id': 'fake', 'approved': True})
        self.assertEqual(response.status_code, 401)

    def test_open_requires_confirmation_and_replay_is_rejected(self):
        with patch.object(computer.platform, 'system', return_value='Windows'), \
             patch.object(computer.subprocess, 'Popen') as launch:
            response = self.client.post('/action/open', json={'app': 'notepad'})
            action = response.json()['pending_action']
            launch.assert_not_called()
            body = {'confirmation_id': action['confirmation_id'], 'approved': True}
            self.assertEqual(self.client.post('/action/confirm', json=body).status_code, 200)
            launch.assert_called_once()
            self.assertFalse(launch.call_args.kwargs['shell'])
            self.assertTrue(Path(launch.call_args.args[0][0]).is_absolute())
            self.assertEqual(self.client.post('/action/confirm', json=body).status_code, 400)

    def test_cancel_and_expiry_never_launch(self):
        with patch.object(computer.subprocess, 'Popen') as launch:
            action = computer.request_action('application', 'calculator')
            self.client.post('/action/confirm', json={'confirmation_id': action['confirmation_id'], 'approved': False})
            action = computer.request_action('application', 'notepad')
            computer.pending[action['confirmation_id']]['expires'] = 0
            response = self.client.post('/action/confirm', json={'confirmation_id': action['confirmation_id'], 'approved': True})
            self.assertEqual(response.status_code, 400)
            launch.assert_not_called()

    def test_reject_commands_paths_and_extra_arguments(self):
        for body in [{'app': 'cmd.exe'}, {'app': 'notepad', 'command': 'calc'},
                     {'app': 'notepad & calc'}, {'app': '../notepad.exe'}]:
            self.assertEqual(self.client.post('/action/open', json=body).status_code, 422)
        for folder in ['..', 'C:\\Windows', 'desktop/../secrets']:
            self.assertEqual(self.client.post('/action/folder', json={'folder': folder}).status_code, 422)
        for name, args in [('run_command', '{}'), ('open_application', '{'),
                           ('open_folder', '{"folder":"../"}'), ('list_processes', '{"command":"cmd"}')]:
            with self.assertRaises(ValueError):
                computer.dispatch(name, args)

    def test_only_boolean_confirmation(self):
        response = self.client.post('/action/confirm', json={'confirmation_id': 'fake', 'approved': 'true'})
        self.assertEqual(response.status_code, 422)

    def test_folder_launch_and_missing_folder(self):
        with patch.object(computer.Path, 'home', return_value=Path(self.temp.name)), \
             patch.object(computer.platform, 'system', return_value='Windows'), \
             patch.object(computer.subprocess, 'Popen') as launch:
            (Path(self.temp.name) / 'Documents').mkdir()
            action = self.client.post('/action/folder', json={'folder': 'documents'}).json()['pending_action']
            launch.assert_not_called()
            result = self.client.post('/action/confirm', json={'confirmation_id': action['confirmation_id'], 'approved': True})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(launch.call_args.args[0][1], str(Path(self.temp.name) / 'Documents'))
            with self.assertRaises(ValueError):
                computer.folder_path('downloads')

    def test_redirected_folder_is_rejected(self):
        with patch.object(computer.Path, 'is_dir', return_value=True), \
             patch.object(computer.Path, 'resolve', return_value=Path(self.temp.name) / 'elsewhere'):
            with self.assertRaises(ValueError):
                computer.folder_path('desktop')

    def test_processes_are_bounded_and_do_not_expose_command_lines(self):
        processes = [SimpleNamespace(info={'pid': i, 'name': f'app{i}'}) for i in range(205)]
        with patch.object(computer.psutil, 'process_iter', return_value=processes):
            data = self.client.get('/computer/processes').json()
        self.assertEqual(len(data['processes']), 200)
        self.assertEqual(data['total'], 205)
        self.assertTrue(data['truncated'])
        self.assertEqual(set(data['processes'][0]), {'pid', 'name'})

    def test_system_information_is_available_without_openai(self):
        response = self.client.get('/computer/system')
        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.json()['memory_total_bytes'], 0)
        self.assertNotIn('environment', response.json())

    def test_chat_history_and_audio(self):
        create = AsyncMock(return_value=completion('Olá!'))
        with patch.object(main.client.chat.completions, 'create', create):
            self.assertEqual(self.client.post('/chat', json={'message': 'Olá'}).json()['reply'], 'Olá!')
        history = self.client.get('/history').json()
        self.assertEqual(history, [{'role': 'user', 'content': 'Olá'}, {'role': 'assistant', 'content': 'Olá!'}])
        with patch.object(main.client.audio.speech, 'create', AsyncMock(return_value=SimpleNamespace(content=b'mp3'))):
            audio = self.client.post('/speak', json={'message': 'Olá'}).json()
        self.assertEqual(base64.b64decode(audio['audio_base64']), b'mp3')
        with patch.object(main.client.chat.completions, 'create', create):
            self.client.post('/chat', json={'message': 'Lembra?'})
        sent = create.call_args.kwargs['messages']
        self.assertIn({'role': 'user', 'content': 'Olá'}, sent)

    def test_ai_tool_call_only_creates_pending_action(self):
        call = SimpleNamespace(id='call_1', function=SimpleNamespace(name='open_application', arguments='{"app":"notepad"}'))
        create = AsyncMock(side_effect=[completion(calls=[call]), completion('Aguardo sua confirmação.')])
        with patch.object(main.client.chat.completions, 'create', create), \
             patch.object(computer.subprocess, 'Popen') as launch:
            response = self.client.post('/chat', json={'message': 'Abra o bloco de notas'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()['pending_actions']), 1)
            launch.assert_not_called()
        self.assertNotIn('confirm', ' '.join(tool['function']['name'] for tool in computer.TOOLS))

    def test_invalid_ai_arguments_are_handled_without_execution(self):
        call = SimpleNamespace(id='call_1', function=SimpleNamespace(name='open_application', arguments='{'))
        create = AsyncMock(side_effect=[completion(calls=[call]), completion('Argumentos inválidos.')])
        with patch.object(main.client.chat.completions, 'create', create), \
             patch.object(computer.subprocess, 'Popen') as launch:
            response = self.client.post('/chat', json={'message': 'Teste'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['pending_actions'], [])
            launch.assert_not_called()

    def test_api_error_does_not_leak_secrets(self):
        with patch.object(main.client.chat.completions, 'create', AsyncMock(side_effect=RuntimeError('SECRET-TEST'))):
            response = self.client.post('/chat', json={'message': 'Teste'})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('SECRET-TEST', response.text)


if __name__ == '__main__':
    unittest.main()
