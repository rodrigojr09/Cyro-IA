const $=id=>document.getElementById(id),role=new URLSearchParams(location.search).get('panel');
$('orb').hidden=role!=='orb';$('composer').hidden=role!=='composer';$('response').hidden=role!=='response';
let current={},audio=null,copyTimer;
const call=promise=>promise.catch(()=>{});
function stopAudio(){if(audio){audio.pause();audio=null;}}
window.quick.onStopAudio(stopAudio);
window.quick.onFocus(()=>{$('question').focus();});
function render(state){
 current=state;
 document.documentElement.style.setProperty('--quick-opacity',String(state.config.opacity));
 if(role==='composer'){
  $('send').disabled=state.busy;$('question').disabled=state.busy;
  $('use-project').disabled=state.busy||!state.project;
  if(!state.project)$('use-project').checked=false;
  $('project-label').textContent=state.project?'Usar '+state.project.name:'Nenhum projeto ativo';
  if(state.error&&state.question&&!$('question').value)$('question').value=state.question;
 }
 if(role==='response'){
  const text=state.busy?'Preparando uma resposta curta...':(state.answer||state.error);
  if($('answer').textContent!==text){$('answer').textContent=text;requestAnimationFrame(()=>{const article=$('answer');article.style.flex='none';const natural=article.scrollHeight;article.style.flex='';call(window.quick.resize(Math.max(130,Math.min(400,natural+110))));});}
  $('response').classList.toggle('busy',state.busy);$('response').classList.toggle('error',!!state.error);
  $('result-status').textContent=state.voicing?'Preparando ou reproduzindo voz':state.error?'Verifique a conexão':state.usedProject?'Contexto: '+state.usedProject:'Conversa rápida';
  $('remaining').textContent=state.busy?'Em andamento':state.pinned?'Fixada':state.voicing?'Áudio ativo':state.hovered?'Pausado':state.remaining+'s';
  $('pin').setAttribute('aria-pressed',String(state.pinned));$('pin').textContent=state.pinned?'Desafixar':'Fixar';
  $('copy').disabled=state.busy||!state.answer;$('stop-audio').hidden=!state.voicing;
 }
}
const surface=$(role==='orb'?'orb':role==='composer'?'composer':'response');
surface.onmouseenter=()=>call(window.quick.pause('hover',true));surface.onmouseleave=()=>call(window.quick.pause('hover',false));
window.quick.onState(render);call(window.quick.state().then(render));
if(role==='orb'){
 let drag=null,moved=false;
 $('orb').onpointerdown=event=>{if(event.button!==0)return;drag={x:event.screenX,y:event.screenY,originX:window.screenX,originY:window.screenY};moved=false;$('orb').setPointerCapture(event.pointerId);};
 $('orb').onpointermove=event=>{if(!drag)return;const dx=event.screenX-drag.x,dy=event.screenY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;if(moved)call(window.quick.move(drag.originX+dx,drag.originY+dy,false));};
 $('orb').onpointerup=event=>{if(!drag)return;const point=drag;drag=null;if(moved)call(window.quick.move(point.originX+event.screenX-point.x,point.originY+event.screenY-point.y,true));else call(window.quick.toggle());};
 $('orb').onpointercancel=()=>{drag=null;};
}
if(role==='composer'){
 window.addEventListener('focus',()=>$('question').focus());
 try{$('question').value=localStorage.getItem('jarvis.quick.draft')||'';}catch{}
 $('question').oninput=()=>{try{localStorage.setItem('jarvis.quick.draft',$('question').value);}catch{}};
 async function submit(){const text=$('question').value.trim();if(!text||current.busy)return;$('send').disabled=true;try{const result=await window.quick.send(text,$('use-project').checked);if(result.ok){$('question').value='';try{localStorage.removeItem('jarvis.quick.draft');}catch{}}}catch{$('question').value=text;}finally{$('send').disabled=false;}}
 $('send').onclick=submit;
 $('question').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void submit();}if(event.key==='Escape')call(window.quick.collapse());};
 $('collapse').onclick=()=>call(window.quick.collapse());
 document.addEventListener('keydown',event=>{if(event.key==='Escape')call(window.quick.collapse());});
}
if(role==='response'){
 document.addEventListener('selectionchange',()=>call(window.quick.pause('selection',!!window.getSelection()?.toString())));
 document.addEventListener('copy',()=>{call(window.quick.pause('copy',true));clearTimeout(copyTimer);copyTimer=setTimeout(()=>call(window.quick.pause('copy',false)),2000);});
 $('pin').onclick=()=>call(window.quick.pin(!current.pinned));$('close-response').onclick=()=>call(window.quick.hide());
 $('copy').onclick=()=>call(window.quick.copy());$('open-main').onclick=()=>call(window.quick.openMain());$('stop-audio').onclick=()=>call(window.quick.stop());
 document.addEventListener('keydown',event=>{if(event.key==='Escape')call(window.quick.hide());});
 window.quick.onAudio(async payload=>{stopAudio();audio=new Audio('data:audio/mp3;base64,'+payload.data);audio.onended=()=>call(window.quick.stop());audio.onerror=()=>call(window.quick.stop());try{await audio.play();}catch{call(window.quick.stop());}});
}
