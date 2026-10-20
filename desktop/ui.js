window.jarvisUI=(()=>{
  const $=id=>document.getElementById(id);
  let preferences={voice:true,collapsed:false,largeText:false},audioGeneration=0;
  try{preferences={...preferences,...JSON.parse(localStorage.getItem('jarvis.preferences')||'{}')};}catch{}
  function persist(){try{localStorage.setItem('jarvis.preferences',JSON.stringify(preferences));}catch{}}
  function icons(){window.jarvisVendor.refreshIcons();}
  function apply(){window.jarvisWindow.voicePreference?.(!!preferences.voice).catch(()=>{});document.body.classList.toggle('sidebar-collapsed',!!preferences.collapsed);document.body.classList.toggle('large-text',!!preferences.largeText);$('sidebar-toggle').setAttribute('aria-expanded',String(!preferences.collapsed));$('voice-toggle').setAttribute('aria-pressed',String(preferences.voice));$('voice-toggle').querySelector('span').textContent=preferences.voice?'Voz ativa':'Voz desativada';persist();}
  function copy(button,text){button.onclick=async()=>{try{await window.jarvisWindow.copyCode(text);button.textContent='Copiado';}catch{button.textContent='Falha ao copiar';}};}
  function render(el,text){
    el.classList.add('markdown');
    // HTML nunca é confiável, incluindo atributos e URLs gerados pelo modelo.
    el.innerHTML=window.jarvisVendor.DOMPurify.sanitize(window.jarvisVendor.marked.parse(text,{gfm:true,breaks:true}),{ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','blockquote','hr','table','thead','tbody','tr','th','td','pre','code','a'],ALLOWED_ATTR:['href','title','class'],ALLOW_DATA_ATTR:false});
    for(const link of el.querySelectorAll('a')){
      const href=link.getAttribute('href')||'';
      if(!/^https?:\/\//i.test(href)){link.removeAttribute('href');continue;}
      link.onclick=event=>{event.preventDefault();window.jarvisWindow.openLink(href).catch(()=>{});};
    }
    for(const pre of el.querySelectorAll('pre')){
      const code=pre.querySelector('code');if(!code)continue;
      const text=code.textContent,language=code.className.replace('language-','').trim().split(/\s/)[0];
      const block=document.createElement('div');block.className='code-block';
      const label=document.createElement('div');label.textContent=language||'código';
      const button=document.createElement('button');button.textContent='Copiar código';copy(button,text);
      if(window.jarvisVendor.hljs.getLanguage(language))window.jarvisVendor.hljs.highlightElement(code);
      pre.replaceWith(block);block.append(label,pre,button);
    }
  }
  function decorate(el,text){const button=document.createElement('button');button.className='message-copy';button.textContent='Copiar mensagem';copy(button,text);el.appendChild(button);}
  function nearBottom(){const area=$('conversation-scroll');return area.scrollHeight-area.scrollTop-area.clientHeight<110;}
  function scroll(force=false){if(force||nearBottom())$('conversation-scroll').scrollTop=$('conversation-scroll').scrollHeight;}
  function welcome(show){$('welcome').hidden=!show;}
  function stopVoice(){audioGeneration++;if(window.jarvisStopAudio)window.jarvisStopAudio();voiceState('');}
  function voiceState(text){$('voice-state').textContent=text;$('voice-state').hidden=!text;$('voice-stop').hidden=!text;}
  function resize(){const area=$('input');area.style.height='auto';area.style.height=Math.min(area.scrollHeight,200)+'px';}
  function empty(){welcome(true);$('messages').replaceChildren();}
  const settings={
    'Aparência':()=>'<h3>Aparência</h3><p>JARVIS Dark · um espaço focado no seu trabalho.</p><label><input type="checkbox" id="setting-large">Texto ampliado nas respostas</label><button id="setting-sidebar">Alternar barra lateral</button>',
    'Voz':()=>'<h3>Voz</h3><p>Respostas de programação usam uma explicação falada resumida.</p><label><input type="checkbox" id="setting-voice">Reproduzir respostas automaticamente</label><button id="setting-stop">Interromper reprodução</button><p>Microfone preparado para integração futura.</p>',
    'Inteligência artificial':()=>'<h3>Inteligência artificial</h3><p>A conexão e os modelos são configurados no backend. Chaves de API nunca são exibidas aqui.</p><p>O chat usa contexto progressivo. A seleção local de fontes não consome tokens; análise e respostas utilizam a API.</p>',
    'Projetos':()=>'<h3>Projetos</h3><p>Cadastre pastas e escolha somente os arquivos relevantes. Builds, dependências e segredos permanecem bloqueados.</p><button id="setting-project">Adicionar projeto</button><button id="setting-sources">Selecionar arquivos do projeto ativo</button>',
    'Memória':()=>'<h3>Memória</h3><p>Cada projeto tem uma base interna separada. Chats e documentos de conhecimento são preservados entre sessões.</p><button id="setting-memory">Gerenciar memória e conversas</button>',
    'Quick Chat':()=>'<h3>JARVIS Quick Chat</h3><p>O ícone permanece disponível sobre as janelas. Use Escape para recolher.</p><label>Opacidade dos painéis (%)<input id="quick-opacity" type="number" min="55" max="95"></label><label>Palavras por minuto<input id="quick-wpm" type="number" min="80" max="600"></label><label>Tempo mínimo (segundos)<input id="quick-min" type="number" min="3" max="60"></label><label>Tempo máximo (segundos)<input id="quick-max" type="number" min="3" max="120"></label><label><input id="quick-voice" type="checkbox">Respostas faladas no Quick Chat (respeita a voz global)</label><label><input id="quick-tray" type="checkbox">Ao fechar a janela principal, manter na bandeja</label><button id="quick-save">Salvar preferências</button><p id="quick-config-status" role="status"></p>',
    'Aplicativo':()=>'<h3>Aplicativo</h3><p>JARVIS · 0.8.0</p><p>F11 alterna a tela cheia. O tamanho e o estado da janela são salvos ao fechar.</p><button id="setting-computer">Controle do computador</button><p>Projetos originais: acesso somente leitura.</p>'
  };
  function category(name){
    $('settings-content').innerHTML=settings[name]();
    for(const button of $('settings-tabs').children)button.classList.toggle('active',button.textContent===name);
    if(name==='Quick Chat'&&window.jarvisWindow.quickSettings){
      const container=$('settings-content');
      window.jarvisWindow.quickSettings().then(value=>{if(!container.querySelector('#quick-save'))return;$('quick-opacity').value=Math.round(value.opacity*100);$('quick-wpm').value=value.wpm;$('quick-min').value=value.minSeconds;$('quick-max').value=value.maxSeconds;$('quick-voice').checked=value.voice;$('quick-tray').checked=value.closeToTray;}).catch(()=>{if($('quick-config-status'))$('quick-config-status').textContent='Não foi possível carregar as preferências.';});
      $('quick-save').onclick=async()=>{try{await window.jarvisWindow.configureQuick({opacity:Number($('quick-opacity').value)/100,wpm:Number($('quick-wpm').value),minSeconds:Number($('quick-min').value),maxSeconds:Number($('quick-max').value),voice:$('quick-voice').checked,closeToTray:$('quick-tray').checked});$('quick-config-status').textContent='Preferências salvas.';}catch{if($('quick-config-status'))$('quick-config-status').textContent='Confira os valores e tente novamente.';}};
    }
    const bind=(id,fn)=>{if($(id))$(id).onclick=fn;};
    if($('setting-large')){$('setting-large').checked=preferences.largeText;bind('setting-large',()=>{preferences.largeText=$('setting-large').checked;apply();});}
    if($('setting-voice')){$('setting-voice').checked=preferences.voice;bind('setting-voice',toggleVoice);}
    bind('setting-sidebar',()=>{preferences.collapsed=!preferences.collapsed;apply();});bind('setting-stop',stopVoice);
    bind('setting-project',()=>{$('settings-dialog').close();$('add-project').click();});
    bind('setting-sources',()=>{$('settings-dialog').close();$('select-sources').click();});
    bind('setting-memory',()=>{$('settings-dialog').close();$('manage-dialog').showModal();});
    bind('setting-computer',()=>{$('settings-dialog').close();$('computer-dialog').showModal();});
    if($('setting-sources'))$('setting-sources').disabled=!window.jarvisWorkspace?.project;
    if($('setting-computer')){$('setting-computer').disabled=!!window.jarvisWorkspace?.project;$('setting-computer').title='Disponível nas conversas gerais';}
  }
  function toggleVoice(){preferences.voice=!preferences.voice;if(!preferences.voice)stopVoice();apply();if($('setting-voice'))$('setting-voice').checked=preferences.voice;}
  $('sidebar-toggle').onclick=()=>{preferences.collapsed=!preferences.collapsed;apply();};
  $('voice-toggle').onclick=toggleVoice;$('voice-stop').onclick=stopVoice;
  $('manage-open').onclick=()=>$('manage-dialog').showModal();
  $('settings-open').onclick=()=>{category('Aparência');$('settings-dialog').showModal();};
  for(const name of Object.keys(settings)){const button=document.createElement('button');button.textContent=name;button.onclick=()=>category(name);$('settings-tabs').appendChild(button);}
  for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
  $('input').addEventListener('input',resize);
  $('conversation-scroll').onscroll=()=>{$('jump-bottom').hidden=nearBottom();};
  $('jump-bottom').onclick=()=>scroll(true);
  $('suggest-project').onclick=()=>$('add-project').click();
  $('suggest-continue').onclick=()=>{preferences.collapsed=false;apply();$('nav-search').focus();};
  for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=async()=>{if(!window.jarvisWorkspace.chat)await window.jarvisWorkspace.newChat();$('input').value=button.dataset.prompt;resize();$('input').focus();};
  apply();icons();
  return {render,decorate,icons,nearBottom,scroll,welcome,empty,resize,stopVoice,voiceState,get voice(){return preferences.voice;},get audioGeneration(){return audioGeneration;},busy(value){$('thinking').hidden=!value;},knowledge(text){render($('knowledge-content'),text);$('knowledge-dialog').showModal();}};
})();
