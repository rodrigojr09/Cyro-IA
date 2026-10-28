import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from pydantic import ValidationError
from project_store import ProjectStore
from programming.security import ReadError
from writer_store import WriterStore, WriterConflict, uid
from writer_models import Save, Block, Decision
from writer_rich import plain, validate
from writer_export import WriterExportService
from writer_intelligence import assist
from test_writer import client, response

class ContinuousWriterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); root=Path(self.temp.name)
        source=root/'source'; source.mkdir()
        self.store=ProjectStore(root/'data'); self.project=self.store.register(source,'Projeto')
        self.store.set_scope(self.project['id'],['.'],[])
        self.writer=WriterStore(self.store,self.project['id']); self.writer.configure({'cloud_consent':True})
        self.doc=self.writer.create('Documento.docx')
    def tearDown(self): self.temp.cleanup()
    def save(self, blocks):
        doc=self.writer.get(self.doc['id'])
        self.writer.save(Save(id=doc['id'],base_version=doc['version'],blocks=blocks,request_id=uid()))
        return self.writer.get(doc['id'])
    def rich(self,text='Antes trecho depois'):
        id=uid(); node={'type':'paragraph','attrs':{'id':id,'textAlign':'center'},'content':[{'type':'text','text':text,'marks':[{'type':'bold'},{'type':'underline'}]}]}
        return {'id':id,'type':'paragraph','text':text,'rich':node}
    def test_legacy_read_preserves_order_history_and_ids(self):
        original=[{'id':uid(),'type':'heading1','text':'Título'},{'id':uid(),'type':'bullet','text':'Item **importante**'}]
        self.save(original); history=self.writer.history(self.doc['id'])
        reopened=WriterStore(self.store,self.project['id']).get(self.doc['id'])
        self.assertEqual(reopened['blocks'],original); self.assertEqual(self.writer.history(self.doc['id']),history)
        data,_=WriterExportService.export(self.writer,[self.doc['id']],'docx')
        self.assertIn(b'Heading1',zipfile.ZipFile(io.BytesIO(data)).read('word/document.xml'))
    def test_rich_roundtrip_idempotency_versions_and_restore(self):
        rich=self.rich(); saved=self.save([rich]); checkpoint=self.writer.history(self.doc['id'])[0]['id']
        newer=self.save([self.rich('Novo conteúdo')]); restored=self.writer.restore(self.doc['id'],newer['version'],checkpoint)
        self.assertEqual(restored['blocks'],saved['blocks'])
        request=Save(id=restored['id'],base_version=restored['version'],blocks=restored['blocks'],request_id=uid())
        first=self.writer.save(request); second=self.writer.save(request); self.assertEqual(first,second)
        self.assertEqual(WriterStore(self.store,self.project['id']).get(self.doc['id'])['blocks'],saved['blocks'])
    def test_invalid_rich_and_mismatched_plain_text_are_rejected(self):
        bad=self.rich(); bad['text']='Different'
        with self.assertRaises(ReadError): self.save([bad])
        for node in [{'type':'paragraph','marks':{}},{'type':'paragraph','content':[{'type':'text','text':'x','marks':[{'type':'link','attrs':{'href':'javascript:alert(1)'}}]}]},{'type':'table','content':[{'type':'text','text':'bad'}]}]:
            with self.assertRaises((ValueError,ValidationError)): Block(id=uid(),text='x',rich=node)
        self.assertEqual(self.writer.get(self.doc['id'])['blocks'],[])
    def test_docx_formats_lists_table_links_alignment_and_breaks(self):
        rich=self.rich(); heading={'id':uid(),'type':'heading1','text':'Título','rich':{'type':'heading','attrs':{'level':1},'content':[{'type':'text','text':'Título'}]}}
        table={'type':'table','content':[{'type':'tableRow','content':[{'type':'tableCell','content':[{'type':'paragraph','content':[{'type':'text','text':'Célula'}]}]}]}]}
        listing={'type':'bulletList','content':[{'type':'listItem','content':[{'type':'paragraph','content':[{'type':'text','text':'Item'}]}]}]}
        link={'type':'paragraph','content':[{'type':'text','text':'Site','marks':[{'type':'italic'},{'type':'link','attrs':{'href':'https://example.com'}}]},{'type':'hardBreak'},{'type':'text','text':'Linha'}]}
        values=[heading,rich]+[{'id':uid(),'type':'paragraph','text':plain(node),'rich':node} for node in [table,listing,link]]
        self.save(values); raw,_=WriterExportService.export(self.writer,[self.doc['id']],'docx')
        archive=zipfile.ZipFile(io.BytesIO(raw)); xml=archive.read('word/document.xml')
        for marker in [b'w:tbl',b'Heading1',b'ListBullet',b'w:b',b'w:u',b'w:i',b'center',b'w:hyperlink',b'w:br']: self.assertIn(marker,xml)
        self.assertIn(b'https://example.com',archive.read('word/_rels/document.xml.rels'))
    async def test_selection_replaces_only_selected_text_and_preserves_other_nodes(self):
        source=self.rich(); untouched=self.rich('Intocado'); doc=self.save([source,untouched])
        packet=response(doc,'',intent='INSTRUCT',operation='replace',blocks=[{'type':'paragraph','text':'melhor'}],blockIds=[source['id']],substantive=True)
        result=await assist(self.writer,{'request_id':uid(),'message':'Melhore esse texto','document_id':doc['id'],'base_version':doc['version'],'continuous':True,'selected_block_ids':[source['id']],'selection':{'block_id':source['id'],'start':6,'end':12,'text':'trecho'}},client(packet),'fixture',True)
        self.assertFalse(result['proposal']['auto']); self.assertEqual(self.writer.get(doc['id'])['blocks'],doc['blocks'])
        self.writer.decide(Decision(id=result['proposal']['id'],approve=True))
        updated=self.writer.get(doc['id'])['blocks']; self.assertEqual(updated[0]['text'],'Antes melhor depois'); self.assertEqual(updated[1],untouched)
        self.assertEqual(updated[0]['rich']['content'][0]['marks'],source['rich']['content'][0]['marks'])
    async def test_question_no_write_and_generation_requires_approval(self):
        doc=self.writer.get(self.doc['id']); packet=response(doc,'',intent='CHAT',blocks=[],reply='Documento vazio')
        result=await assist(self.writer,{'request_id':uid(),'message':'Qual o objetivo?','document_id':doc['id'],'base_version':doc['version'],'continuous':True},client(packet),'fixture',True)
        self.assertIsNone(result.get('proposal')); self.assertEqual(self.writer.get(doc['id'])['blocks'],[])
        generated=response(doc,'Relatório de visita',intent='INSTRUCT',blocks=[{'type':'heading1','text':'Relatório'},{'type':'paragraph','text':'Dados da visita.'}],substantive=True)
        result=await assist(self.writer,{'request_id':uid(),'message':'Gere um relatório','document_id':doc['id'],'base_version':doc['version'],'continuous':True},client(generated),'fixture',True)
        self.assertFalse(result['proposal']['auto']); self.writer.decide(Decision(id=result['proposal']['id'],approve=True)); self.assertEqual(len(self.writer.get(doc['id'])['blocks']),2)
        current=self.writer.get(doc['id']); original=current['blocks']
        section=response(current,'',intent='INSTRUCT',blocks=[{'type':'heading2','text':'Conclusão'},{'type':'paragraph','text':'Nova seção.'}],substantive=True)
        extra=await assist(self.writer,{'request_id':uid(),'message':'Acrescente uma conclusão','document_id':doc['id'],'base_version':current['version'],'continuous':True},client(section),'fixture',True)
        self.writer.decide(Decision(id=extra['proposal']['id'],approve=True));self.assertEqual(self.writer.get(doc['id'])['blocks'][:2],original)

    def test_control_messages_do_not_change_document_or_duplicate(self):
        doc=self.save([self.rich()]); chat=self.writer.bind_chat(doc['id'])
        payload={'id':doc['id'],'chat_id':chat['id'],'message':'Desfazer','reply':'Última edição desfeita.','request_id':uid()}
        self.writer.control(payload); self.writer.control(payload)
        self.assertEqual(len(self.writer.messages(doc['id'])),2); self.assertEqual(self.writer.get(doc['id']),doc)
        source=Path(self.temp.name)/'other'; source.mkdir(); project=self.store.register(source,'Outro')
        other=WriterStore(self.store,project['id'])
        with self.assertRaises(ReadError): other.get(doc['id'])

    def test_recovery_exports_unsynced_draft_without_saving(self):
        original=self.save([self.rich('Salvo')]); draft=[self.rich('Rascunho offline')]
        raw,_=WriterExportService.export(self.writer,[self.doc['id']],'docx',draft)
        from docx import Document
        self.assertIn('Rascunho offline',' '.join(p.text for p in Document(io.BytesIO(raw)).paragraphs))
        self.assertEqual(self.writer.get(self.doc['id']),original)

    async def test_multi_paragraph_selection_preserves_unselected_prefix_and_suffix(self):
        first=self.rich('Prefixo melhorar');last=self.rich('trecho Sufixo');doc=self.save([first,last])
        selected=[{'block_id':first['id'],'start':8,'end':16,'text':'melhorar'},{'block_id':last['id'],'start':0,'end':6,'text':'trecho'}]
        result=await assist(self.writer,{'request_id':uid(),'message':'Melhore essa seleção','document_id':doc['id'],'base_version':doc['version'],'continuous':True,'selected_block_ids':[first['id'],last['id']],'selections':selected},client(response(doc,'',intent='INSTRUCT',operation='replace',blockIds=[first['id'],last['id']],blocks=[{'type':'paragraph','text':'novo texto'}],substantive=True)),'fixture',True)
        self.writer.decide(Decision(id=result['proposal']['id'],approve=True));changed=self.writer.get(doc['id'])['blocks']
        self.assertEqual(changed[0]['text'],'Prefixo novo texto');self.assertEqual(changed[1]['text'],' Sufixo')
    def test_nested_selection_keeps_list_structure_and_marks(self):
        from writer_rich import splice_inline
        value={'type':'bulletList','content':[{'type':'listItem','content':[{'type':'paragraph','content':[{'type':'text','text':'Primeiro','marks':[{'type':'bold'}]}]}]},{'type':'listItem','content':[{'type':'paragraph','content':[{'type':'text','text':'Segundo'}]}]}]}
        changed=splice_inline(value,0,8,'Novo');self.assertEqual(plain(changed),'Novo\nSegundo');self.assertEqual(changed['type'],'bulletList')

    async def test_grammar_correction_is_pointed_and_keeps_existing_formatting(self):
        source=self.rich('O funcionário chegaram.');other=self.rich('Não alterar.');doc=self.save([source,other])
        packet=response(doc,'',intent='INSTRUCT',operation='replace',blockIds=[source['id']],blocks=[{'type':'paragraph','text':'O colaborador chegou.'}],substantive=True)
        result=await assist(self.writer,{'request_id':uid(),'message':'Corrija a gramática e troque funcionário por colaborador','document_id':doc['id'],'base_version':doc['version'],'continuous':True},client(packet),'fixture',True)
        self.writer.decide(Decision(id=result['proposal']['id'],approve=True)); updated=self.writer.get(doc['id'])['blocks']
        self.assertEqual(updated[0]['text'],'O colaborador chegou.');self.assertEqual(updated[1],other)
        self.assertTrue(all(run.get('marks')==source['rich']['content'][0]['marks'] for run in updated[0]['rich']['content']))
    def test_pointed_insert_at_start_and_end(self):
        from writer_rich import splice_inline
        node=self.rich('abc')['rich'];self.assertEqual(plain(splice_inline(node,0,0,'X')),'Xabc');self.assertEqual(plain(splice_inline(node,3,3,'X')),'abcX')

    async def test_manual_edit_during_generation_is_never_overwritten(self):
        source=self.rich('Original');doc=self.save([source])
        def provider(options):
            self.save([self.rich('Edição manual durante a resposta')])
            return response(doc,'',intent='INSTRUCT',operation='replace',blockIds=[source['id']],blocks=[{'type':'paragraph','text':'Resposta atrasada'}],substantive=True)
        with self.assertRaises(WriterConflict):
            await assist(self.writer,{'request_id':uid(),'message':'Melhore a introdução','document_id':doc['id'],'base_version':doc['version'],'continuous':True},client(provider),'fixture',True)
        self.assertEqual(self.writer.get(doc['id'])['blocks'][0]['text'],'Edição manual durante a resposta')
