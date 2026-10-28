import { Node, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import UniqueID from '@tiptap/extension-unique-id';
import { closeHistory } from '@tiptap/pm/history';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
const PageBreak = Node.create({name:'pageBreak',group:'block',atom:true,parseHTML:()=>[{tag:'hr[data-page-break]'}],renderHTML:()=>['hr',{'data-page-break':'true'}]});
export const extensions = () => [StarterKit.configure({link:{openOnClick:false,protocols:['http','https','mailto'],HTMLAttributes:{target:null,rel:null,class:null}},heading:{levels:[1,2,3,4,5,6]}}), TextAlign.configure({types:['heading','paragraph']}),TableKit.configure({table:{resizable:false}}),PageBreak,UniqueID.configure({types:['paragraph','heading','bulletList','orderedList','table','blockquote','codeBlock','horizontalRule','pageBreak'],generateID:()=>crypto.randomUUID()})];
export function nodeText(node) {
 if(node.type==='text') return node.text || '';
 if(node.type==='hardBreak') return '\n';
 const separator=['bulletList','orderedList','listItem','table','tableRow','tableCell','tableHeader','blockquote'].includes(node.type)?'\n':'';
 return (node.content||[]).map(nodeText).join(separator);
}
export function toDocument(blocks=[]) {
 const content=blocks.flatMap(block=>{
  if(block.rich) return [{...structuredClone(block.rich),attrs:{...block.rich.attrs,id:block.id}}];
  if(block.type==='pagebreak') return [{type:'pageBreak',attrs:{id:block.id}}];
  let html=DOMPurify.sanitize(marked.parse(block.text||'',{breaks:true}),{ALLOWED_TAGS:['p','br','strong','em','u','s','code','pre','a','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','table','thead','tbody','tr','th','td','hr'],ALLOWED_ATTR:['href','title']});
  let nodes=generateJSON(html,extensions()).content || [{type:'paragraph'}];
  if(!nodes.length) nodes=[{type:'paragraph'}];
  if(block.type==='heading1'||block.type==='heading2') nodes=[{type:'heading',attrs:{level:block.type==='heading1'?1:2},content:nodes.flatMap(n=>n.content||[])}];
  if(block.type==='bullet'||block.type==='number') nodes=[{type:block.type==='bullet'?'bulletList':'orderedList',content:[{type:'listItem',content:nodes}]}];
  return nodes.map((node,index)=>({...node,attrs:{...node.attrs,id:index===0?block.id:crypto.randomUUID()}}));
 });
 return {type:'doc',content:content.length?content:[{type:'paragraph',attrs:{id:crypto.randomUUID()}}]};
}
export function editorBlocks(editor) {
 return editor.getJSON().content.map(node=>({id:node.attrs?.id || crypto.randomUUID(),type:node.type==='heading'?(node.attrs?.level===1?'heading1':'heading2'):node.type==='pageBreak'?'pagebreak':node.type==='bulletList'?'bullet':node.type==='orderedList'?'number':'paragraph',text:nodeText(node),rich:node}));
}
const children = doc => {const result=[];doc.forEach(node=>result.push(node));return result;};
function difference(before,after) {
 let left=0,right=0;
 while(left<before.length&&left<after.length&&before[left].eq(after[left])) left++;
 while(right<before.length-left&&right<after.length-left&&before[before.length-1-right].eq(after[after.length-1-right])) right++;
 return {left,right,before:before.slice(left,before.length-right),after:after.slice(left,after.length-right)};
}
function replace(editor,left,count,nodes) {
 const current=children(editor.state.doc); const from=current.slice(0,left).reduce((sum,n)=>sum+n.nodeSize,0); const to=from+current.slice(left,left+count).reduce((sum,n)=>sum+n.nodeSize,0);
 const tr=closeHistory(editor.state.tr).replaceWith(from,to,nodes); editor.view.dispatch(tr); editor.view.dispatch(closeHistory(editor.state.tr));
}
export function connectEditor(editor,writer) {
 let lastAI=null, selectiveRedo=null, remote=false;
 const apply = (blocks,source='remote') => {
  const next=editor.schema.nodeFromJSON(toDocument(blocks)), before=children(editor.state.doc), after=children(next), delta=difference(before,after);
  if(!delta.before.length&&!delta.after.length) return;
  remote=true;
  try { replace(editor,delta.left,delta.before.length,delta.after); }
  finally {remote=false;}
  if(source==='ai') { lastAI={...delta,leftId:before[delta.left-1]?.attrs.id,rightId:before[before.length-delta.right]?.attrs.id}; selectiveRedo=null; }
 };
 const selective = reverse => {
  const operation=reverse?selectiveRedo:lastAI;
  if(!operation) return 'Não há alteração recente do Cyro disponível neste editor. Consulte as versões salvas.';
  const current=children(editor.state.doc), expected=reverse?operation.before:operation.after, restored=reverse?operation.after:operation.before;
  const left=operation.leftId?current.findIndex(n=>n.attrs.id===operation.leftId)+1:0;
  const right=operation.rightId?current.findIndex(n=>n.attrs.id===operation.rightId):current.length;
  if(left<0||right<left||right-left!==expected.length||!expected.every((n,i)=>current[left+i]?.eq(n))) return 'Há edições manuais no trecho alterado pelo Cyro. Nenhuma alteração foi desfeita. Confirme qual trecho ou versão deseja recuperar; suas edições serão preservadas.';
  replace(editor,left,expected.length,restored); selectiveRedo=reverse?null:operation; if(!reverse)lastAI=null;
  return reverse?'Alteração do Cyro refeita.':'Última alteração do Cyro desfeita; as edições fora desse trecho foram preservadas.';
 };
 const adapter={apply, get remote(){return remote;},control(action,specific=false){
  if(specific) return selective(action==='redo');
  const ok=action==='undo'?editor.commands.undo():editor.commands.redo();
  return ok?(action==='undo'?'Última edição desfeita.':'Última edição refeita.'):'Não há operação recente para '+(action==='undo'?'desfazer.':'refazer.');
 }};
 writer.bindEditor(adapter);
 return {adapter,dispose:()=>writer.bindEditor(null)};
}
