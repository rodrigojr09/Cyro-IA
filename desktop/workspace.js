// Navegação por IDs: a propriedade de uma conversa é validada pelo backend.
window.jarvisWorkspace = (() => {
  let project = null, chat = null, chats = [], olderThan = null, loading = false, busy = false;
  let polling;
  const el = id => document.getElementById(id);
  const post = (route, body) => api(route, {method:'POST',body:JSON.stringify(body)});
  function options(select, items, value) {
    select.replaceChildren();
    for (const item of items) {
      const option = document.createElement('option');
      option.value = item.id || '';
      option.textContent = item.title || item.name;
      option.title = item.path || option.textContent;
      select.appendChild(option);
    }
    select.value = value || '';
  }
  function controls() {
    el('send').disabled = busy || loading || !chat || !!chat.archived || !!(project&&(!project.ready||project.scope_confirmed===0));
    el('new-chat').disabled = busy || loading || !!(project && (!project.ready||project.scope_confirmed===0));
    for(const id of ['project-select','chat-select','add-project'])el(id).disabled=busy||loading;
    el('accept-partial').hidden = !(project && !project.ready && project.knowledge_version > 0 && project.state === 'partial');
    const states={selecting:'aguardando seleção de arquivos',empty:'seleção sem arquivos elegíveis',ready:'atualizada',partial:'parcial',queued:'verificação na fila',indexing:'em análise',unavailable:'desatualizada: pasta indisponível',interrupted:'atualização interrompida'};
    el('memory-state').textContent = project ? `Base v${project.knowledge_version} · ${states[project.state]||project.state} · ${project.progress}` : 'Conversa geral · memória independente';
    el('memory-state').title=project ? `${project.tokens||0} tokens registrados pela API. ${project.progress}` : '';
    el('project-name').textContent = project ? 'Projeto: '+project.name : 'JARVIS · conversas gerais';
    el('refresh-memory').disabled = !project || project.scope_confirmed===0 || ['queued','indexing'].includes(project.state);
    el('select-sources').disabled=busy||loading||!project||['queued','indexing'].includes(project.state);
    el('remove-project').disabled = !project || ['queued','indexing'].includes(project.state);
    el('show-knowledge').disabled = !project || !project.knowledge_version;
    el('save-note').disabled = !project || !project.ready;
    for (const id of ['rename-chat','archive-chat','delete-chat']) el(id).disabled = !chat || loading || busy;
    el('programming-mode').disabled = !!project;
    if (project) { el('programming-mode').checked=true; el('programming-mode').onchange(); }
  }
  async function openChat(id) {
    loading=true; controls();
    try {
      const result = await api('/chats/history?chat_id='+encodeURIComponent(id));
      chat = result.chat;
      olderThan = result.messages.length ? result.messages[0].id : null;
      messages.replaceChildren();
      for (const item of result.messages) addMessage(item.role,item.content);
      if (!result.messages.length) addMessage('assistant',project ? 'Memória do projeto carregada. O que deseja investigar?' : 'Como posso ajudar?');
      el('chat-title').value=chat.title;
      el('archive-chat').textContent=chat.archived ? 'Restaurar' : 'Arquivar';
      el('chat-select').value=chat.id;
    } finally { loading=false; controls(); }
  }
  async function view(id, preferredChat) {
    loading=true; chat=null; controls();
    try {
      const result=await post('/workspace/view',{project_id:id||null});
      project=result.project;
      chats=[...result.chats,...result.archived_chats.map(item=>({...item,title:'[Arquivada] '+item.title}))];
      options(el('chat-select'),chats,preferredChat);
      if (chats.length) await openChat(chats.some(item=>item.id===preferredChat) ? preferredChat : chats[0].id);
      else {
        messages.replaceChildren();
        addMessage('assistant',project?.scope_confirmed===0 ? 'Escolha Arquivos do projeto antes de iniciar. Selecionar nomes e pastas não consome tokens.' : 'Preparando a base de conhecimento. Aguarde a conclusão ou aceite uma análise parcial quando disponível.');
      }
    } finally { loading=false; controls(); }
  }
  async function catalog(selectedId, preferredChat) {
    const result=await api('/workspace');
    const current=selectedId===undefined ? project?.id : selectedId;
    options(el('project-select'),[{id:'',name:'Conversas gerais'},...result.projects.map(item=>({...item,name:item.name+' — '+item.path}))],current);
    await view(current,preferredChat || (!current ? result.general_chat_id : null));
  }
  async function poll() {
    try {
      if (project && !loading && !send.disabled) {
        const result=await api('/workspace');
        const updated=result.projects.find(item=>item.id===project.id);
        if (updated) { project=updated; controls(); }
      } else if (project && !loading) {
        const result=await api('/workspace');
        const updated=result.projects.find(item=>item.id===project.id);
        if (updated) {
          const becameReady=!project.ready && updated.ready;
          project=updated;
          if (becameReady && !chat) await view(project.id);
          controls();
        }
      }
    } catch { /* O indicador permanece com o último estado conhecido. */ }
    finally { polling=setTimeout(poll,1200); }
  }
  function handler(id, callback) {
    el(id).onclick=async()=>{if(busy||loading)return;try{await callback();}catch(error){addMessage('assistant','Erro: '+error.message);controls();}};
  }
  async function init() {
    el('workspace-controls').hidden=false;
    el('legacy-roots').hidden=true;
    el('project-select').onchange=async()=>{try{await view(el('project-select').value);}catch(error){addMessage('assistant','Erro: '+error.message);}};
    el('chat-select').onchange=async()=>{try{await openChat(el('chat-select').value);}catch(error){addMessage('assistant','Erro: '+error.message);}};
    handler('add-project',async()=>{
      const result=await window.jarvisWindow.authorizeFolder();
      if(result.canceled)return;
      if(!result.ok)throw new Error(result.data.detail||'Falha no cadastro');
      await catalog(result.data.id);
      if(window.jarvisScope)await window.jarvisScope.open(project,async()=>catalog(project.id,chat?.id));
    });
    handler('new-chat',async()=>{const item=await post('/chats/create',{project_id:project?.id||null,title:el('chat-title').value||'Nova conversa'});await catalog(project?.id||'',item.id);});
    handler('rename-chat',async()=>{const result=await window.jarvisWindow.manageChat(chat.id,'rename',el('chat-title').value);if(!result.ok)throw new Error(result.data.detail);await catalog(project?.id||'',chat.id);});
    handler('archive-chat',async()=>{const result=await window.jarvisWindow.manageChat(chat.id,chat.archived?'restore':'archive');if(result.canceled)return;if(!result.ok)throw new Error(result.data.detail);await catalog(project?.id||'');});
    handler('delete-chat',async()=>{const result=await window.jarvisWindow.manageChat(chat.id,'delete');if(result.canceled)return;if(!result.ok)throw new Error(result.data.detail);await catalog(project?.id||'');});
    handler('remove-project',async()=>{const result=await window.jarvisWindow.removeProject(project.id);if(result.canceled)return;if(!result.ok)throw new Error(result.data.detail);await catalog('');});
    handler('refresh-memory',async()=>{project=await post('/projects/refresh',{project_id:project.id});controls();});
    handler('select-sources',()=>window.jarvisScope.open(project,async()=>catalog(project.id,chat?.id)));
    handler('accept-partial',async()=>{await post('/projects/accept-partial',{project_id:project.id});await catalog(project.id);});
    handler('show-knowledge',async()=>{const result=await api('/projects/knowledge?project_id='+encodeURIComponent(project.id));addMessage('assistant',result.content);});
    handler('save-note',async()=>{await post('/projects/note',{project_id:project.id,kind:el('note-kind').value,content:el('project-note').value});el('project-note').value='';await catalog(project.id,chat?.id);});
    handler('expand-window',()=>window.jarvisWindow.expand());
    handler('older-messages',async()=>{
      if(!chat||!olderThan)return;
      const result=await api('/chats/history?chat_id='+chat.id+'&before='+olderThan);
      if(!result.messages.length){el('older-messages').textContent='Início do histórico';return;}
      olderThan=result.messages[0].id;
      // Exibe uma página anterior sem perder a seleção da conversa.
      messages.replaceChildren();
      for(const item of result.messages)addMessage(item.role,item.content);
    });
    await catalog('');
    polling=setTimeout(poll,1200);
  }
  return {init,get project(){return project;},get chat(){return chat;}, controls,
    begin(){busy=true;controls();},end(){busy=false;controls();}};
})();
