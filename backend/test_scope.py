import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import main
import test_jarvis
from project_chat import ProjectChatService
from project_index import ProjectIndexer
from project_scope import RegisteredReadPolicy,SourceSelection
from project_store import ProjectStore,database
from programming.security import ReadError
from test_projects import fake_client,snapshot


def sources(root):
    files={'src/main.ts':'import { helper } from "./helper";\nexport function main() { return helper(); }',
           'src/helper.ts':'export function helper() { return "UNSELECTED_CONTENT"; }',
           'unused/other.py':'print("UNSELECTED_OTHER")',
           'package.json':'{"dependencies":{"react":"19"}}',
           'package-lock.json':'{"LOCK_CONTENT":"excluded"}',
           'dist/bundle.js':'BUILD_CONTENT',
           'node_modules/vendor/index.js':'VENDOR_CONTENT',
           '.env':'API_KEY=PRIVATE_VALUE'}
    for name,content in files.items():
        target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content,encoding='utf-8')
    return root


class ScopeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import asyncio
        asyncio.get_running_loop().slow_callback_duration=1
        self.temp=tempfile.TemporaryDirectory()
        self.base=Path(self.temp.name)
        self.original=sources(self.base/'original')
        self.before=snapshot(self.original)
        self.store=ProjectStore(self.base/'data')
        self.project=self.store.register(self.original)
        self.client=fake_client()
        self.index=ProjectIndexer(self.store,self.client,'fake',lambda:True)

    async def asyncTearDown(self):
        await self.index.stop()
        self.assertEqual(self.before,snapshot(self.original))
        self.temp.cleanup()

    async def test_preview_only_reads_metadata_and_disables_generated_sources(self):
        with patch.object(Path,'open',side_effect=AssertionError('Conteúdo não deve ser aberto')):
            result=self.store.selection_preview(self.project['id'])
        self.assertEqual(result['api_calls'],0)
        self.assertTrue(result['metadata_only'])
        blocked={item['name'] for item in result['entries'] if item['disabled']}
        self.assertTrue({'dist','node_modules','package-lock.json','.env'}<=blocked)
        self.assertFalse(self.client.chat.completions.create.await_count)

    async def test_only_selected_files_are_opened_indexed_and_sent(self):
        self.store.set_scope(self.project['id'],['src/main.ts'],[])
        opened=[];original_open=Path.open
        def controlled(path,*args,**kwargs):
            if path.is_relative_to(self.original):
                opened.append(path.relative_to(self.original).as_posix())
                self.assertEqual(path,self.original/'src/main.ts')
            return original_open(path,*args,**kwargs)
        with patch.object(Path,'open',controlled):await self.index.index(self.project['id'])
        self.assertTrue(opened)
        packet=str(self.client.chat.completions.create.call_args_list)
        for content in ['UNSELECTED_CONTENT','UNSELECTED_OTHER','LOCK_CONTENT','BUILD_CONTENT','VENDOR_CONTENT']:
            self.assertNotIn(content,packet)
        with database(self.store.db_path(self.project['id'])) as con:
            self.assertEqual([row['path'] for row in con.execute('SELECT path FROM files')],['src/main.ts'])

    async def test_chat_direct_reads_search_and_related_imports_respect_selection(self):
        self.store.set_scope(self.project['id'],['src/main.ts'],[])
        await self.index.index(self.project['id'])
        service=ProjectChatService(self.store,self.store.chats(self.project['id'])[0])
        with self.assertRaises(ReadError):service.policy.read('src/helper.ts',self.original)
        denied=service.dispatch('read_file',json.dumps({'path':'src/helper.ts'}))
        self.assertNotIn('UNSELECTED_CONTENT',json.dumps(denied))
        self.assertNotIn('content',denied)
        result=service.dispatch('get_file_context',json.dumps({'path':'src/main.ts'}))
        self.assertFalse(result['related'])
        self.assertFalse(service.dispatch('search_code',json.dumps({'query':'UNSELECTED_CONTENT'}))['matches'])

    async def test_scope_change_reuses_kept_cache_and_does_not_forward_old_history(self):
        self.store.set_scope(self.project['id'],['src','package.json'],[])
        await self.index.index(self.project['id'])
        chat=self.store.chats(self.project['id'])[0]
        self.store.append(chat['id'],'assistant','UNSELECTED_CONTENT from helper.ts')
        count=self.client.chat.completions.create.await_count
        self.store.set_scope(self.project['id'],['src/main.ts'],[])
        self.assertTrue(self.store.history(chat['id']))
        self.assertFalse(self.store.history(chat['id'],for_model=True))
        self.assertFalse(self.store.chat(chat['id'])['summary'])
        self.assertNotIn('UNSELECTED_CONTENT',self.store.knowledge(self.project['id']))
        await self.index.index(self.project['id'])
        self.assertEqual(self.client.chat.completions.create.await_count,count)
        self.assertNotIn('src/helper.ts',self.store.knowledge(self.project['id']))

    async def test_same_selection_is_noop_and_persists_across_restart(self):
        self.store.set_scope(self.project['id'],['src/main.ts'],[])
        await self.index.index(self.project['id'])
        version=self.store.project(self.project['id'])['knowledge_version']
        result=self.store.set_scope(self.project['id'],['SRC/main.ts'],[])
        self.assertFalse(result['selection_changed'])
        restored=ProjectStore(self.store.root)
        self.assertEqual(restored.scope(self.project['id'])['include'],['src/main.ts'])
        self.assertEqual(restored.project(self.project['id'])['knowledge_version'],version)

    async def test_empty_selection_has_zero_ai_calls(self):
        self.store.set_scope(self.project['id'],[],[])
        await self.index.index(self.project['id'])
        self.assertFalse(self.client.chat.completions.create.await_count)
        self.assertEqual(self.store.project(self.project['id'])['state'],'empty')

    async def test_folder_selection_inherits_new_files_but_single_file_does_not(self):
        self.store.set_scope(self.project['id'],['src'],['src/helper.ts'])
        policy=self.store.read_policy(self.project['id'])
        with self.assertRaises(ReadError):policy.read('src/helper.ts',self.original)
        self.assertIn('main',policy.read('src/main.ts',self.original)['content'])
        self.assertTrue(policy.selection.selected('src/new.ts'))
        self.assertFalse(SourceSelection(['src/main.ts'],[]).selected('src/new.ts'))

    async def test_nested_include_can_override_parent_exclusion(self):
        selection=SourceSelection(['.','src/main.ts'],['src'])
        self.assertTrue(selection.navigable('src'))
        self.assertTrue(selection.selected('src/main.ts'))
        self.assertFalse(selection.selected('src/helper.ts'))

    async def test_scope_cannot_override_security_or_escape_project(self):
        for path in ['../outside.py','C:\\Windows\\file.py','src/main.ts:ads','.env','package-lock.json','dist']:
            with self.assertRaises(ReadError):self.store.set_scope(self.project['id'],[path],[])

    async def test_legacy_reads_cannot_bypass_registered_selection(self):
        self.store.set_scope(self.project['id'],['src/main.ts'],[])
        policy=RegisteredReadPolicy([self.original],self.store)
        self.assertIn('main',policy.read(self.original/'src/main.ts')['content'])
        with self.assertRaises(ReadError):policy.read(self.original/'src/helper.ts')

    async def test_migrate_v04_requires_review_and_preserves_chats(self):
        self.store.set_scope(self.project['id'],['src'],[])
        await self.index.index(self.project['id'])
        chat=self.store.chats(self.project['id'])[0]
        self.store.append(chat['id'],'user','Historical conversation')
        with database(self.store.registry) as con:
            con.execute('ALTER TABLE projects DROP COLUMN scope_confirmed')
            con.execute('PRAGMA user_version=1')
        restored=ProjectStore(self.store.root)
        self.assertFalse(restored.project(self.project['id'])['scope_confirmed'])
        self.assertEqual(restored.history(chat['id'])[0]['content'],'Historical conversation')
        with self.assertRaises(ReadError):restored.read_policy(self.project['id'])


class ScopeAPITests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)
        self.original=sources(Path(self.temp.name)/'original')

    def tearDown(self):test_jarvis.JarvisTests.tearDown(self)

    def test_registration_and_preview_do_not_start_ai_and_save_unchanged_does_not_enqueue(self):
        project=self.client.post('/projects/register',json={'path':str(self.original)}).json()
        self.assertEqual(project['scope_confirmed'],0)
        self.assertFalse(main.indexer.pending)
        with patch.object(Path,'open',side_effect=AssertionError('Não abrir conteúdos')):
            data=self.client.get('/projects/selection',params={'project_id':project['id']}).json()
        self.assertEqual(data['api_calls'],0)
        main.store.set_scope(project['id'],['src/main.ts'],[])
        with patch.object(main.indexer,'enqueue') as enqueue:
            self.assertEqual(self.client.post('/projects/selection/save',json={'project_id':project['id'],'include':['src/main.ts'],'exclude':[]}).status_code,200)
        enqueue.assert_not_called()


if __name__=='__main__':unittest.main()
