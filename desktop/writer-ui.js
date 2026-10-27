/* Structured blocks are data. No document HTML or model text is executed. */
(() => {
  if (!window.jarvisWriter) return;
  const embedded = !!document.getElementById('messages');
  let embeddedActive = false,
    fileInfo = null;
  const originalContext = document.getElementById('composer-context')?.innerHTML;
  const aliases = {
    'writer-input': 'input',
    'writer-send': 'send',
    'writer-messages': 'messages',
    'writer-status': 'status',
    'writer-cancel': 'cancel-response',
    'writer-chat-title': 'conversation-name',
  };
  const bridge = window.jarvisWriter,
    $ = (id) => document.getElementById(embedded ? aliases[id] || id : id),
    uid = () => crypto.randomUUID();
  let project = null,
    catalog = null,
    doc = null,
    proposal = null,
    sequence = 0,
    savedSequence = 0,
    saving = null,
    saveError = false,
    editing = false,
    loading = false,
    showRemoved = false,
    assistantBusy = false,
    autoTimer = null,
    generation = 0,
    currentMessage = '',
    selectedBlocks = [],
    selectedText = '';
  const collapsed = new Set();
  function paintSelection() {
    for (const element of $('writer-paper').querySelectorAll('[data-block]'))
      element.classList.toggle('writer-selected', selectedBlocks.includes(element.dataset.block));
    $('writer-selection').textContent = selectedBlocks.length
      ? 'Trecho selecionado · limpar ×'
      : 'Documento inteiro';
  }
  function clearSelection() {
    selectedBlocks = [];
    selectedText = '';
    window.CSS?.highlights?.delete('writer-selection');
    paintSelection();
  }
  function rememberSelection(ids, text, range = null) {
    selectedBlocks = ids;
    selectedText = text.slice(0, 2000);
    window.CSS?.highlights?.delete('writer-selection');
    if (range && window.CSS?.highlights && window.Highlight)
      window.CSS.highlights.set('writer-selection', new Highlight(range.cloneRange()));
    paintSelection();
  }
  const root = document.createElement('dialog');
  root.id = 'writer-dialog';
  root.setAttribute('aria-labelledby', 'writer-heading');
  root.innerHTML = `<header class="writer-header"><div><span class="writer-eyebrow">Cyro IA WRITER</span><h2 id="writer-heading">Escrita do projeto</h2></div><span id="writer-save-state" role="status">Salvo</span><button id="writer-retry" hidden>Tentar salvar</button><button id="writer-compare-save" hidden>Comparar edição</button><button id="writer-settings">Preferências</button><button id="writer-close" aria-label="Fechar Writer">×</button></header>
  <div class="writer-workspace"><aside class="writer-files"><div class="writer-files-heading"><strong>Arquivos e chats</strong><button id="writer-new" title="Novo chat Writer">＋</button></div><div id="writer-recent"></div><nav id="writer-tree" aria-label="Documentos Writer"></nav><button id="writer-new-folder">Nova pasta</button><button id="writer-trash">Itens removidos</button><div class="writer-file-tools"><button id="writer-rename">Renomear</button><button id="writer-duplicate">Duplicar</button><button id="writer-move">Mover</button><button id="writer-delete">Remover</button></div></aside>
  <section class="writer-conversation"><div class="writer-chat-heading"><div><strong id="writer-chat-title">Escolha um arquivo</strong><p>Converse, escreva ou peça uma revisão.</p></div><button id="writer-toggle-files">Arquivos</button><button id="writer-toggle-preview" aria-expanded="true">Documento</button></div><div id="writer-messages" aria-live="polite"></div>
  <div id="writer-proposal" hidden><div><span id="writer-intent-badge"></span><strong id="writer-proposal-title"></strong></div><p id="writer-proposal-reason"></p><p id="writer-countdown" role="status"></p><div class="writer-proposal-actions"><button id="writer-approve">Aprovar alteração</button><button id="writer-reject">Rejeitar</button><button id="writer-adjust">Ajustar</button><button id="writer-show-target">Ver documento</button></div><div id="writer-adjust-area" hidden><label>Proposta editável<textarea id="writer-adjust-text" maxlength="12000"></textarea></label><button id="writer-apply-adjusted">Aplicar texto ajustado</button></div></div>
  <footer class="writer-chat-composer"><p class="writer-cloud-notice">Enviar usa a IA Cloud e compartilha somente a mensagem e os trechos necessários. Edições manuais ficam neste computador.</p><textarea id="writer-input" maxlength="6000" rows="3" placeholder="Escreva um trecho ou converse com o Cyro..."></textarea><div><button id="writer-selection" title="Sem seleção, usa o documento inteiro; se exceder o limite, prioriza o final. Clique para limpar a seleção.">Documento inteiro</button><button id="writer-cancel" hidden>Cancelar IA</button><button id="writer-send">Enviar ao Writer</button></div><p id="writer-status" role="status"></p></footer></section>
  <aside class="writer-preview"><header><div><span>PRÉVIA DO DOCUMENTO</span><strong id="writer-filename">Nenhum arquivo</strong></div><button id="writer-edit" aria-pressed="false">Editar</button><button id="writer-collapse-assistant" aria-pressed="false" title="Ampliar documento">Ampliar</button></header><div class="writer-document-tools"><button id="writer-undo">Desfazer</button><button id="writer-redo">Refazer</button><button id="writer-history">Revisões</button><button id="writer-export">Exportar</button><span id="writer-word-count">0 palavras</span></div><p id="writer-preview-notice"></p><nav id="writer-outline" aria-label="Seções do documento"></nav><div id="writer-paper" tabindex="0"></div><div id="writer-edit-tools" hidden><button id="writer-add-block">＋ Parágrafo</button><button id="writer-bold">Negrito</button><button id="writer-italic">Itálico</button></div></aside></div>`;
  document.body.append(root);
  let layout, chatColumn, preview, writerStrip;
  if (embedded) {
    layout = document.createElement('div');
    layout.className = 'chat-document-layout';
    chatColumn = document.createElement('div');
    chatColumn.className = 'writer-standard-chat';
    const scroll = document.getElementById('conversation-scroll');
    scroll.before(layout);
    layout.append(chatColumn);
    chatColumn.append(
      scroll,
      document.getElementById('jump-bottom'),
      document.querySelector('.composer-wrap'),
    );
    preview = root.querySelector('.writer-preview');
    preview.hidden = true;
    preview.id = 'writer-preview-pane';
    layout.append(preview);
    const tools = preview.querySelector('.writer-document-tools');
    tools.append($('writer-settings'), $('writer-retry'), $('writer-compare-save'));
    const saveFile = document.createElement('button');
    saveFile.id = 'writer-save-file';
    saveFile.textContent = 'Salvar no arquivo';
    saveFile.onclick = () =>
      run(async () => {
        await flush();
        await syncFile();
      });
    tools.append(saveFile);
    preview.append($('writer-save-state'));
    const composer = document.querySelector('.composer-wrap');
    composer.prepend($('writer-proposal'));
    writerStrip = document.createElement('div');
    writerStrip.id = 'writer-context-strip';
    writerStrip.hidden = true;
    writerStrip.append($('writer-selection'));
    const notice = document.createElement('small');
    notice.textContent =
      'Pergunte sobre o arquivo ou peça uma alteração. Revise as mudanças em azul.';
    writerStrip.append(notice);
    composer.prepend(writerStrip);
  }
  const promptDialog = document.createElement('dialog');
  promptDialog.id = 'writer-prompt';
  promptDialog.innerHTML = `<form method="dialog"><h3 id="writer-prompt-title"></h3><label id="writer-prompt-label">Nome do arquivo<input id="writer-prompt-value" maxlength="120" required autocomplete="off"></label><label id="writer-kind-label">Tipo<select id="writer-prompt-kind"><option value="document">Documento</option><option value="chapter">Capítulo</option><option value="section">Seção</option><option value="folder">Pasta</option></select></label><p id="writer-prompt-hint"></p><footer><button value="cancel" formnovalidate>Cancelar</button><button value="ok">Continuar</button></footer></form>`;
  promptDialog.setAttribute('aria-labelledby', 'writer-prompt-title');
  document.body.append(promptDialog);
  const settingsDialog = document.createElement('dialog');
  settingsDialog.id = 'writer-preferences';
  settingsDialog.setAttribute('aria-labelledby', 'writer-settings-heading');
  settingsDialog.innerHTML = `<h3 id="writer-settings-heading">Writer deste projeto</h3><label><input id="writer-consent" type="checkbox">Autorizo enviar a mensagem e contexto seletivo à IA Cloud ao clicar em Enviar</label><label><input id="writer-auto" type="checkbox">Adicionar automaticamente apenas escrita inequívoca</label><label><input id="writer-linguistic" type="checkbox">Melhorar clareza e gramática preservando minha voz</label><label>Preferências de estilo<textarea id="writer-style" maxlength="2000"></textarea></label><label>Tempo para cancelar inserção (segundos)<input id="writer-delay" type="number" min="0" max="10"></label><label>Revisões recentes preservadas na limpeza manual<input id="writer-retention" type="number" min="10" max="2000"></label><label>Largura<select id="writer-width"><option value="comfortable">Confortável</option><option value="wide">Ampla</option></select></label><p>Até 512 KB por documento e 5 MB por projeto no Writer, incluindo histórico. Revisões importantes nunca são removidas pela limpeza.</p><button id="writer-prune">Revisar limpeza de versões manuais antigas</button><button id="writer-settings-save">Salvar preferências</button><button id="writer-settings-close">Fechar</button><p id="writer-settings-status" role="status"></p>`;
  document.body.append(settingsDialog);
  const historyDialog = document.createElement('dialog');
  historyDialog.id = 'writer-history-dialog';
  historyDialog.innerHTML = `<h3 id="writer-history-heading">Histórico e recuperação</h3><select id="writer-revisions" aria-label="Versão histórica"></select><div class="writer-comparison"><section><h4>Antes</h4><pre id="writer-history-before"></pre></section><section><h4>Depois</h4><pre id="writer-history-after"></pre></section></div><pre id="writer-history-original"></pre><button id="writer-restore">Restaurar como nova revisão</button><button id="writer-history-close">Fechar</button>`;
  historyDialog.setAttribute('aria-labelledby', 'writer-history-heading');
  document.body.append(historyDialog);
  const exportDialog = document.createElement('dialog');
  exportDialog.id = 'writer-export-dialog';
  exportDialog.innerHTML = `<h3 id="writer-export-heading">Exportar documento</h3><label>Formato<select id="writer-export-format"><option value="docx">Word (.docx)</option><option value="md">Markdown (.md)</option><option value="txt">Texto (.txt)</option></select></label><label>Conteúdo<select id="writer-export-scope"><option value="current">Arquivo atual</option><option value="selection">Escolher capítulos e documentos</option><option value="all">Projeto completo</option></select></label><fieldset id="writer-export-selection" hidden><legend>Incluir na exportação</legend><div id="writer-export-items"></div></fieldset><p>Somente o conteúdo confirmado será exportado. A proposta em azul não entra no arquivo.</p><button id="writer-export-save">Escolher onde salvar</button><button id="writer-export-close">Cancelar</button></dialog>`;
  exportDialog.setAttribute('aria-labelledby', 'writer-export-heading');
  document.body.append(exportDialog);
  const moveDialog = document.createElement('dialog');
  moveDialog.id = 'writer-move-dialog';
  moveDialog.innerHTML = `<h3 id="writer-move-heading">Mover arquivo</h3><label>Destino<select id="writer-move-parent"></select></label><p>Você verá uma proposta antes de confirmar a reorganização.</p><button id="writer-move-prepare">Preparar mudança</button><button id="writer-move-close">Cancelar</button>`;
  moveDialog.setAttribute('aria-labelledby', 'writer-move-heading');
  document.body.append(moveDialog);
  const conflictDialog = document.createElement('dialog');
  conflictDialog.id = 'writer-save-conflict';
  conflictDialog.setAttribute('aria-labelledby', 'writer-save-conflict-title');
  conflictDialog.innerHTML = `<h3 id="writer-save-conflict-title">Recuperar edição pendente</h3><p>Compare antes de substituir. A versão salva ficará no histórico.</p><div class="writer-comparison"><section><h4>Salvo no projeto</h4><pre id="writer-conflict-server"></pre></section><section><h4>Sua edição aberta</h4><pre id="writer-conflict-draft"></pre></section></div><button id="writer-conflict-apply">Salvar minha edição como nova revisão</button><button id="writer-conflict-close">Manter edição aberta</button></dialog>`;
  document.body.append(conflictDialog);
  let comparedVersion = null;
  const status = (text, error = false) => {
    $('writer-status').textContent = text;
    $('writer-status').classList.toggle('error', error);
  };
  async function command(action, payload = {}, projectId = project?.id) {
    if (!projectId) throw Error('Abra um projeto para usar o Writer.');
    const response = await bridge.command({ project_id: projectId, action, payload });
    if (!response.ok)
      throw Error(
        typeof response.data?.detail === 'string'
          ? response.data.detail
          : 'Operação Writer indisponível.',
      );
    return response.data;
  }
  async function run(fn) {
    try {
      return await fn();
    } catch (error) {
      status(error.message || 'Não foi possível concluir.', true);
      return null;
    }
  }
  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
    $('writer-countdown').textContent = '';
  }
  async function ask(heading, value = '', kind = false, hint = '') {
    $('writer-prompt-title').textContent = heading;
    $('writer-prompt-value').value = value;
    $('writer-kind-label').hidden = !kind;
    $('writer-prompt-hint').textContent = hint;
    promptDialog.returnValue = '';
    $('writer-prompt-kind').value = 'document';
    promptDialog.showModal();
    $('writer-prompt-value').focus();
    return new Promise((resolve) =>
      promptDialog.addEventListener(
        'close',
        () =>
          resolve(
            promptDialog.returnValue === 'ok'
              ? { title: $('writer-prompt-value').value, kind: $('writer-prompt-kind').value }
              : null,
          ),
        { once: true },
      ),
    );
  }
  function updateSaveState() {
    const dirty = sequence !== savedSequence;
    $('writer-save-state').textContent = dirty
      ? saveError
        ? 'Edição pendente — não feche'
        : 'Salvando…'
      : embeddedActive && fileInfo?.linked && fileInfo.saved_version !== doc?.version
        ? 'Salvo no Cyro · alterações pendentes no arquivo'
        : 'Salvo neste computador';
    $('writer-retry').hidden = !saveError;
    $('writer-compare-save').hidden = !saveError;
    bridge.dirty(dirty).catch(() => {});
    $('writer-word-count').textContent =
      (
        doc?.blocks
          .map((b) => b.text)
          .join(' ')
          .match(/\S+/g) || []
      ).length + ' palavras';
  }
  function changed() {
    sequence++;
    saveError = false;
    updateSaveState();
    drain();
  }
  function drain() {
    if (saving || !doc || sequence === savedSequence || saveError) return saving;
    const projectId = project.id,
      documentId = doc.id;
    saving = (async () => {
      // Coalesce consecutive keystrokes without persisting browser drafts or dropping acknowledged edits.
      await new Promise((resolve) => setTimeout(resolve, 350));
      while (sequence !== savedSequence) {
        const revision = sequence,
          body = structuredClone(doc.blocks),
          version = doc.version;
        const saved = await command(
          'save',
          { id: documentId, base_version: version, blocks: body, request_id: uid() },
          projectId,
        );
        if (doc?.id !== documentId) throw Error('Documento mudou durante o salvamento.');
        doc.version = saved.version;
        savedSequence = revision;
        updateSaveState();
      }
    })()
      .catch((error) => {
        saveError = true;
        status(error.message + ' Sua edição permanece aberta para recuperação.', true);
        updateSaveState();
      })
      .finally(() => {
        saving = null;
        if (sequence !== savedSequence && !saveError) drain();
      });
    return saving;
  }
  async function flush() {
    await drain();
    if (saving) await saving;
    if (sequence !== savedSequence)
      throw Error(
        'Há uma edição pendente. Resolva o salvamento antes de trocar de arquivo ou fechar.',
      );
  }
  function inline(parent, text) {
    for (const piece of text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g)) {
      const count =
        piece.startsWith('***') && piece.endsWith('***')
          ? 3
          : piece.startsWith('**') && piece.endsWith('**')
            ? 2
            : piece.startsWith('*') && piece.endsWith('*')
              ? 1
              : 0;
      if (!count) {
        parent.append(document.createTextNode(piece));
        continue;
      }
      const el = document.createElement(count === 1 ? 'em' : 'strong');
      el.textContent = piece.slice(count, -count);
      if (count === 3) {
        const em = document.createElement('em');
        em.append(el);
        parent.append(em);
      } else parent.append(el);
    }
  }
  function diffTokens(parent, before, after) {
    const a = before.split(/(\s+)/),
      b = after.split(/(\s+)/);
    if (a.length * b.length > 160000) {
      const del = document.createElement('del');
      del.textContent = before;
      const add = document.createElement('mark');
      add.textContent = after;
      parent.append(del, document.createElement('br'), add);
      return;
    }
    const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        rows[i][j] =
          a[i] === b[j] ? 1 + rows[i + 1][j + 1] : Math.max(rows[i + 1][j], rows[i][j + 1]);
    let i = 0,
      j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        parent.append(document.createTextNode(a[i++]));
        j++;
      } else if (j < b.length && (i === a.length || rows[i][j + 1] >= rows[i + 1][j])) {
        const mark = document.createElement('mark');
        mark.textContent = b[j++];
        parent.append(mark);
      } else {
        const del = document.createElement('del');
        del.textContent = a[i++];
        parent.append(del);
      }
    }
  }
  function blockElement(block, change = '') {
    const el = document.createElement(
      block.type === 'heading1'
        ? 'h2'
        : block.type === 'heading2'
          ? 'h3'
          : block.type === 'pagebreak'
            ? 'hr'
            : 'p',
    );
    el.dataset.block = block.id;
    el.id = 'writer-block-' + block.id;
    el.className = 'writer-block ' + change;
    if (block.type === 'bullet' || block.type === 'number') {
      el.classList.add('writer-list');
      el.dataset.marker = block.type === 'bullet' ? '•' : '1.';
    }
    if (block.type !== 'pagebreak') inline(el, block.text);
    el.classList.toggle('writer-selected', selectedBlocks.includes(block.id));
    return el;
  }
  function renderPreview() {
    const paper = $('writer-paper');
    paper.replaceChildren();
    $('writer-filename').textContent = doc?.title || 'Nenhum arquivo';
    $('writer-preview-notice').textContent = '';
    $('writer-outline').replaceChildren();
    updateSaveState();
    if (!doc) {
      $('writer-edit-tools').hidden = true;
      updateSaveState();
      paper.textContent = 'Crie um chat Writer e escolha o nome do arquivo para começar.';
      return;
    }
    $('writer-edit-tools').hidden = !editing || doc.kind === 'folder';
    if (doc.deleted) {
      paper.textContent =
        'Arquivo removido. Use Desfazer para recuperar o documento e sua organização.';
      $('writer-edit-tools').hidden = true;
      return;
    }
    if (doc.kind === 'folder') {
      paper.textContent = 'Esta pasta organiza documentos e capítulos.';
      return;
    }
    const heading = document.createElement('h1');
    heading.textContent = doc.title.replace(/\.(docx|md|txt)$/i, '');
    paper.append(heading);
    const plan =
      proposal?.state === 'PENDING' && proposal.plan.targetDocumentId === doc.id
        ? proposal.plan
        : null;
    if (plan) {
      $('writer-preview-notice').textContent =
        proposal.base !== doc.version
          ? 'A proposta usa outra versão. Compare e solicite atualização antes de aplicar.'
          : 'Azul = proposta ainda não aplicada. Trechos riscados serão removidos.';
    }
    if (editing) {
      for (const block of doc.blocks) {
        const row = document.createElement('div');
        row.className = 'writer-block-editor';
        row.dataset.block = block.id;
        row.classList.toggle('writer-selected', selectedBlocks.includes(block.id));
        const type = document.createElement('select');
        type.setAttribute('aria-label', 'Formato do bloco');
        for (const [value, label] of Object.entries({
          paragraph: 'Parágrafo',
          heading1: 'Título',
          heading2: 'Subtítulo',
          bullet: 'Lista',
          number: 'Lista numerada',
          pagebreak: 'Quebra de página',
        })) {
          const option = new Option(label, value);
          type.add(option);
        }
        type.value = block.type;
        type.onchange = () => {
          block.type = type.value;
          changed();
        };
        const input = document.createElement('textarea');
        input.dataset.block = block.id;
        input.value = block.text;
        input.maxLength = 12000;
        input.rows = Math.min(12, Math.max(2, block.text.split('\n').length));
        input.setAttribute('aria-label', 'Texto do bloco');
        input.oninput = () => {
          block.text = input.value;
          clearSelection();
          changed();
        };
        input.onselect = () => {
          if (input.selectionEnd > input.selectionStart)
            rememberSelection(
              [block.id],
              input.value.slice(input.selectionStart, input.selectionEnd),
            );
          else if (document.activeElement === input) clearSelection();
        };
        input.onmouseup = input.onselect;
        const remove = document.createElement('button');
        remove.textContent = 'Remover bloco';
        remove.onclick = () => {
          doc.blocks = doc.blocks.filter((b) => b.id !== block.id);
          if (selectedBlocks.includes(block.id)) clearSelection();
          changed();
          renderPreview();
        };
        row.append(type, input, remove);
        paper.append(row);
      }
      updateSaveState();
      return;
    }
    const selected = new Set(plan?.blockIds || []);
    let diffShown = false;
    for (const block of doc.blocks) {
      if (plan?.operation === 'replace' && selected.has(block.id)) {
        if (!diffShown) {
          const change = document.createElement('div');
          change.className = 'writer-change';
          diffTokens(
            change,
            (proposal.original?.blocks || doc.blocks)
              .filter((b) => selected.has(b.id))
              .map((b) => b.text)
              .join('\n\n'),
            plan.blocks.map((b) => b.text).join('\n\n'),
          );
          paper.append(change);
          diffShown = true;
        }
        continue;
      }
      const el = blockElement(
        block,
        plan?.operation === 'delete' ||
          (plan?.operation === 'move_blocks' && selected.has(block.id))
          ? 'writer-removed'
          : '',
      );
      paper.append(el);
      if (block.type.startsWith('heading')) {
        const link = document.createElement('button');
        link.textContent = block.text.slice(0, 80);
        link.onclick = () => el.scrollIntoView({ block: 'start' });
        $('writer-outline').append(link);
      }
    }
    if (plan?.operation === 'append')
      for (const block of plan.blocks) paper.append(blockElement(block, 'writer-added'));
    if (plan && ['rename', 'move', 'split', 'delete', 'move_blocks'].includes(plan.operation)) {
      const note = document.createElement('div');
      note.className = 'writer-change';
      note.textContent = describe(plan);
      paper.prepend(note);
      if (plan.operation === 'rename') heading.textContent = plan.title;
    }
    if (!doc.blocks.length && !plan) {
      const empty = document.createElement('p');
      empty.className = 'writer-empty';
      empty.textContent = 'Seu documento começa aqui. Escreva no chat ou clique em Editar.';
      paper.append(empty);
    }
    updateSaveState();
  }
  function describe(plan) {
    const name = (id) => catalog?.nodes.find((n) => n.id === id)?.title || 'documento';
    return {
      append: 'Adicionar texto ao final de ' + name(plan.targetDocumentId),
      replace: 'Revisar o trecho selecionado em ' + name(plan.targetDocumentId),
      create: 'Criar ' + plan.title,
      rename: 'Renomear para ' + plan.title,
      move: 'Mover para ' + (plan.parentId ? name(plan.parentId) : 'a raiz do Writer'),
      delete: 'Remover ' + name(plan.targetDocumentId) + ' de forma recuperável',
      split: 'Dividir o documento; nova parte: ' + plan.title,
      move_blocks: 'Mover o trecho para ' + name(plan.destinationDocumentId),
    }[plan.operation];
  }
  function renderProposal() {
    const visible = proposal?.state === 'PENDING';
    $('writer-proposal').hidden = !visible;
    if (embedded) {
      $('writer-send').title = visible ? 'Aprovar alteração anterior e enviar' : 'Enviar mensagem';
      $('writer-send').setAttribute('aria-label', $('writer-send').title);
    } else $('writer-send').textContent = visible ? 'Aprovar e enviar' : 'Enviar ao Writer';
    if (!visible) return;
    $('writer-intent-badge').textContent = 'Alteração proposta';
    $('writer-proposal-title').textContent = describe(proposal.plan);
    $('writer-proposal-reason').textContent =
      proposal.base !== doc?.version && proposal.node === doc?.id
        ? 'A versão-base mudou. Solicite uma nova versão ou compare o histórico.'
        : 'Revise o azul à direita. Enviar a próxima mensagem aprova esta alteração. Para descartá-la, clique em Rejeitar antes de continuar.';
    $('writer-approve').disabled = !!(proposal.node === doc?.id && proposal.base !== doc?.version);
    if (embeddedActive && window.jarvisWorkspace?.chat?.archived)
      $('writer-approve').disabled = true;
    $('writer-show-target').hidden = !proposal.node || proposal.node === doc?.id;
    $('writer-adjust-area').hidden = true;
  }
  function tree() {
    const target = $('writer-tree');
    target.replaceChildren();
    function branch(parent, depth) {
      for (const node of catalog.nodes.filter((n) => !n.deleted && n.parent === parent)) {
        const row = document.createElement('div');
        row.className = 'writer-tree-row';
        row.style.paddingLeft = depth * 12 + 'px';
        const expand = document.createElement('button');
        expand.textContent = collapsed.has(node.id) ? '›' : '⌄';
        expand.setAttribute('aria-label', 'Expandir ou recolher ' + node.title);
        expand.onclick = () => {
          collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id);
          tree();
        };
        const item = document.createElement('button');
        item.textContent = (node.kind === 'folder' ? '▱ ' : '') + node.title;
        item.classList.toggle('active', node.id === doc?.id);
        item.onclick = () => run(() => load(node.id));
        row.append(expand, item);
        target.append(row);
        if (!collapsed.has(node.id)) branch(node.id, depth + 1);
      }
    }
    branch(null, 0);
    if (showRemoved)
      for (const node of catalog.nodes.filter((n) => n.deleted)) {
        const item = document.createElement('button');
        item.className = 'writer-trash-item';
        item.textContent = 'Removido: ' + node.title;
        item.onclick = () => run(() => load(node.id));
        target.append(item);
      }
    $('writer-trash').textContent = showRemoved ? 'Ocultar removidos' : 'Itens removidos';
    $('writer-recent').replaceChildren();
    for (const node of catalog.nodes
      .filter((n) => !n.deleted && n.kind !== 'folder')
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 3)) {
      const item = document.createElement('button');
      item.textContent = node.title;
      item.title = 'Arquivo recente';
      item.onclick = () => run(() => load(node.id));
      $('writer-recent').append(item);
    }
  }
  async function refreshTree() {
    catalog = await command('open');
    root.dataset.width = catalog.settings.width;
    tree();
  }
  async function load(id) {
    if (loading) return;
    loading = true;
    const fields = [...$('writer-paper').querySelectorAll('textarea,select,button')];
    fields.forEach((el) => (el.disabled = true));
    try {
      await flush();
      stopAuto();
      generation++;
      if (assistantBusy) await bridge.cancel(project.id);
      const next = await command('get', { id, include_removed: true });
      selectedBlocks = [];
      selectedText = '';
      window.CSS?.highlights?.delete('writer-selection');
      proposal = null;
      editing = false;
      doc = next;
      sequence = savedSequence = 0;
      saveError = false;
      $('writer-input').value = '';
      $('writer-selection').textContent = 'Documento inteiro';
      $('writer-chat-title').textContent = doc.title;
      $('writer-edit').setAttribute('aria-pressed', 'false');
      $('writer-edit').textContent = 'Editar';
      await refreshTree();
      await messages();
      renderProposal();
      renderPreview();
    } finally {
      loading = false;
      fields.forEach((el) => (el.disabled = false));
    }
  }
  function bubble(role, content, intent) {
    if (embedded && typeof addMessage === 'function') {
      addMessage(role, content);
      window.jarvisUI?.welcome(false);
      window.jarvisUI?.scroll(true);
      return $('writer-messages').lastElementChild;
    }
    const row = document.createElement('div');
    row.className = 'writer-message ' + role;
    const text = document.createElement('p');
    text.textContent = content;
    row.append(text);
    $('writer-messages').append(row);
    return row;
  }
  async function messages() {
    $('writer-messages').replaceChildren();
    const values = await command('messages', { id: doc?.id || null });
    let pending = null;
    for (const item of values) {
      const row = bubble(item.role, item.content, item.intent);
      if (item.proposal_state?.state === 'PENDING') {
        pending = item.proposal_state.id;
        const button = document.createElement('button');
        button.textContent = 'Rever proposta';
        button.onclick = () =>
          run(async () => {
            stopAuto();
            proposal = await command('proposal', { id: item.proposal_state.id });
            currentMessage = proposal.instruction;
            renderProposal();
            renderPreview();
          });
        row.append(button);
      }
    }
    if (pending) {
      proposal = await command('proposal', { id: pending });
      currentMessage = proposal.instruction;
    }
    $('writer-messages').scrollTop = $('writer-messages').scrollHeight;
  }
  async function decide(approve, automatic = false, edited_blocks = null) {
    stopAuto();
    await flush();
    if (!proposal) return;
    const id = proposal.id;
    const result = await command('decide', { id, approve, automatic, edited_blocks });
    proposal.state = result.state;
    if (result.state === 'CONFLICTED') {
      status(result.message, true);
      renderProposal();
      renderPreview();
      return result;
    }
    if (approve && result.state === 'APPLIED') {
      status('Alteração salva. Use Desfazer para recuperar a versão anterior.');
      if (doc) doc = await command('get', { id: doc.id, include_removed: true });
      if (embeddedActive) await syncFile();
      if (proposal.plan.operation === 'delete') {
        doc = await command('get', { id: doc.id, include_removed: true });
        editing = false;
        showRemoved = true;
      }
    } else
      status(
        result.state === 'REJECTED'
          ? 'Proposta rejeitada. O documento não mudou.'
          : 'Proposta expirada. Solicite uma nova versão.',
      );
    await refreshTree();
    renderProposal();
    renderPreview();
    return result;
  }
  let sending = false;
  async function send() {
    if (assistantBusy || sending) return;
    sending = true;
    if (embeddedActive) window.jarvisWorkspace?.begin();
    $('writer-send').disabled = true;
    try {
      return await prepareSend();
    } finally {
      sending = false;
      $('writer-send').disabled = assistantBusy;
      if (embeddedActive) window.jarvisWorkspace?.end();
    }
  }
  async function prepareSend() {
    await flush();
    if (!doc || doc.deleted || doc.kind === 'folder')
      throw Error('Escolha ou crie um arquivo para o chat Writer.');
    if (!catalog.settings.cloud_consent) {
      settingsDialog.showModal();
      fillSettings();
      throw Error(
        'Autorize o uso da IA Cloud nas preferências. A edição manual já está disponível.',
      );
    }
    const text = $('writer-input').value.trim();
    if (!text || text.length > 6000) return;
    stopAuto();
    if (proposal?.state === 'PENDING') {
      const edited = $('writer-adjust-area').hidden ? null : proposal.plan.blocks;
      const previous = await decide(true, false, edited);
      if (previous?.state !== 'APPLIED')
        throw Error(
          'A alteração anterior não foi aplicada. Revise o conflito ou a proposta antes de continuar.',
        );
      selectedBlocks = [];
      selectedText = '';
      $('writer-selection').textContent = 'Documento inteiro';
      if (doc.deleted || doc.kind === 'folder')
        throw Error(
          'Alteração anterior aplicada. Escolha um documento ativo para continuar a conversa.',
        );
    }
    const epoch = generation,
      documentId = doc.id;
    currentMessage = text;
    assistantBusy = true;
    $('writer-send').disabled = true;
    $('writer-cancel').hidden = false;
    const pendingBubble = bubble('user', text);
    $('writer-input').value = '';
    if (embeddedActive) window.jarvisUI?.resize();
    status('Consultando IA Cloud…');
    try {
      const result = await command('assist', {
        ...(embeddedActive ? { chat_id: window.jarvisWorkspace.chat.id } : {}),
        request_id: uid(),
        message: text,
        document_id: documentId,
        base_version: doc.version,
        selected_block_ids: selectedBlocks,
        selected_text: selectedText,
        intent_override: null,
      });
      if (epoch !== generation) return;
      const replyRow = bubble('assistant', result.reply, result.intent);
      if (result.context_notice) {
        const note = document.createElement('small');
        note.className = 'writer-context-note';
        note.textContent = result.context_notice;
        replyRow.prepend(note);
      }
      proposal = result.proposal;
      if (proposal) {
        editing = false;
        $('writer-edit').textContent = 'Editar';
        $('writer-edit').setAttribute('aria-pressed', 'false');
      }
      renderProposal();
      renderPreview();
      if (proposal?.auto && proposal.state === 'PENDING') {
        let remaining = result.cancel_seconds;
        const update = () => {
          $('writer-countdown').textContent =
            'Inserção inequívoca em ' + remaining + ' s. Clique em Rejeitar para cancelar.';
        };
        update();
        if (remaining === 0) {
          await decide(true, true);
          return;
        }
        autoTimer = setInterval(() => {
          remaining--;
          update();
          if (remaining <= 0) {
            stopAuto();
            run(() => decide(true, true));
          }
        }, 1000);
      }
      status(
        result.proposal
          ? 'Revise a proposta no documento.'
          : 'Resposta recebida. O documento não foi alterado.',
      );
      if (embeddedActive) {
        window.jarvisUI?.resize();
        window.jarvisUI?.scroll(true);
      }
      return true;
    } catch (error) {
      if (epoch !== generation) return;
      if (!$('writer-input').value) {
        pendingBubble.remove();
        $('writer-input').value = text;
        status(error.message + ' Sua mensagem continua disponível para nova tentativa.', true);
      } else {
        const failed = document.createElement('small');
        failed.className = 'writer-context-note error';
        failed.textContent = 'Não enviada';
        pendingBubble.prepend(failed);
        status(
          error.message +
            ' Seu novo rascunho foi preservado; a mensagem não enviada continua visível acima.',
          true,
        );
      }
      if (embeddedActive) window.jarvisUI?.resize();
      return false;
    } finally {
      assistantBusy = false;
      $('writer-send').disabled = false;
      $('writer-cancel').hidden = true;
    }
  }
  async function create(kind = 'document') {
    await flush();
    const value = await ask(
      kind === 'folder' ? 'Nome da pasta' : 'Novo chat Cyro IA Writer',
      '',
      kind !== 'folder',
      'Escolha o nome do arquivo. O texto fica no banco do projeto; a exportação Word usará este nome.',
    );
    if (!value) return;
    if (kind === 'folder') value.kind = 'folder';
    const name =
      value.kind === 'folder'
        ? value.title
        : value.title.replace(/\.(docx|md|txt)$/i, '') + '.docx';
    const node = await command('create', {
      title: name,
      kind: value.kind,
      parentId: doc?.kind === 'folder' ? doc.id : null,
    });
    await load(node.id);
  }
  async function structure(operation, extra = {}) {
    await flush();
    if (!doc) return;
    stopAuto();
    proposal = await command('structure', {
      id: doc.id,
      base_version: doc.version,
      plan: { operation, targetDocumentId: doc.id, ...extra },
    });
    renderProposal();
    renderPreview();
    status('Organização proposta; revise antes de aprovar.');
  }
  function fillSettings() {
    const s = catalog.settings;
    $('writer-consent').checked = s.cloud_consent;
    $('writer-auto').checked = s.auto_write;
    $('writer-linguistic').checked = s.linguistic;
    $('writer-style').value = s.style;
    $('writer-delay').value = s.cancel_seconds;
    $('writer-retention').value = s.retention;
    $('writer-width').value = s.width;
    $('writer-settings-status').textContent = '';
  }
  async function open(options = {}) {
    if (embedded) return createChat();
    const active = window.jarvisWorkspace?.project;
    if (!active) throw Error('Writer é exclusivo dos projetos. Abra um projeto primeiro.');
    await flush();
    stopAuto();
    if (assistantBusy) await bridge.cancel(project.id);
    project = { id: active.id, name: active.name };
    catalog = await command('open');
    doc = null;
    proposal = null;
    sequence = savedSequence = 0;
    saveError = false;
    generation++;
    $('writer-heading').textContent = project.name;
    $('writer-input').value = '';
    $('writer-messages').replaceChildren();
    root.showModal();
    tree();
    renderProposal();
    renderPreview();
    const recent = catalog.nodes
      .filter((n) => !n.deleted && n.kind !== 'folder')
      .sort((a, b) => b.updated.localeCompare(a.updated))[0];
    if (recent) await load(recent.id);
    else if (!options.preferencesOnly) await create();
  }
  if ($('writer-open')) $('writer-open').onclick = () => run(open);
  if ($('project-writer-settings'))
    $('project-writer-settings').onclick = () =>
      run(async () => {
        $('project-settings-dialog').close();
        if (embedded) {
          const active = window.jarvisWorkspace?.project;
          if (!active) return;
          project = active;
          catalog = await command('open');
        } else await open({ preferencesOnly: true });
        stopAuto();
        fillSettings();
        settingsDialog.showModal();
      });
  $('writer-new').onclick = () => run(() => create());
  $('writer-new-folder').onclick = () => run(() => create('folder'));
  $('writer-close').onclick = () =>
    run(async () => {
      await flush();
      stopAuto();
      if (assistantBusy) await bridge.cancel(project.id);
      generation++;
      root.close();
      bridge.dirty(false);
    });
  root.addEventListener('cancel', (event) => {
    event.preventDefault();
    $('writer-close').click();
  });
  $('writer-retry').onclick = () =>
    run(async () => {
      saveError = false;
      await flush();
    });
  $('writer-compare-save').onclick = () =>
    run(async () => {
      if (!doc) return;
      stopAuto();
      const saved = await command('get', { id: doc.id });
      comparedVersion = saved.version;
      $('writer-conflict-server').textContent = saved.blocks.map((b) => b.text).join('\n\n');
      $('writer-conflict-draft').textContent = doc.blocks.map((b) => b.text).join('\n\n');
      conflictDialog.showModal();
    });
  $('writer-conflict-close').onclick = () => conflictDialog.close();
  $('writer-conflict-apply').onclick = () =>
    run(async () => {
      if (!comparedVersion) return;
      doc.version = comparedVersion;
      saveError = false;
      await flush();
      conflictDialog.close();
      status('Edição recuperada como nova revisão; versão anterior preservada.');
    });
  if (!embedded) $('writer-send').onclick = () => run(() => send());
  if (!embedded)
    $('writer-input').onkeydown = (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault();
        $('writer-send').click();
      }
    };
  if (!embedded)
    $('writer-cancel').onclick = () =>
      run(async () => {
        stopAuto();
        await bridge.cancel(project.id);
        status('Cancelamento solicitado.');
      });
  $('writer-approve').onclick = () => run(() => decide(true));
  $('writer-reject').onclick = () => run(() => decide(false));
  $('writer-adjust').onclick = () => {
    stopAuto();
    if (['append', 'replace'].includes(proposal.plan.operation)) {
      $('writer-adjust-area').hidden = false;
      $('writer-approve').disabled = true;
      $('writer-adjust-text').value = proposal.plan.blocks.map((b) => b.text).join('\n\n');
    } else {
      $('writer-input').value = proposal.instruction + '\nAjuste: ';
      $('writer-input').focus();
    }
  };
  $('writer-adjust-text').oninput = () => {
    if (!proposal) return;
    proposal.plan.blocks = $('writer-adjust-text')
      .value.split('\n\n')
      .filter(Boolean)
      .map((text) => ({ id: uid(), type: 'paragraph', text }));
    renderPreview();
  };
  $('writer-apply-adjusted').onclick = () =>
    run(() =>
      decide(
        true,
        false,
        $('writer-adjust-text')
          .value.split('\n\n')
          .filter(Boolean)
          .map((text) => ({ id: uid(), type: 'paragraph', text })),
      ),
    );
  $('writer-show-target').onclick = () =>
    run(async () => {
      const p = proposal;
      await load(p.node);
      proposal = p;
      renderProposal();
      renderPreview();
    });
  $('writer-edit').onclick = () =>
    run(async () => {
      await flush();
      stopAuto();
      if (!doc || doc.deleted) return;
      editing = !editing;
      $('writer-edit').textContent = editing ? 'Ver prévia' : 'Editar';
      $('writer-edit').setAttribute('aria-pressed', String(editing));
      renderPreview();
    });
  $('writer-add-block').onclick = () => {
    if (!doc) return;
    doc.blocks.push({ id: uid(), type: 'paragraph', text: '' });
    changed();
    renderPreview();
    $('writer-paper').querySelector('textarea:last-of-type')?.focus();
  };
  for (const [id, marker] of [
    ['writer-bold', '**'],
    ['writer-italic', '*'],
  ])
    $(id).onclick = () => {
      const field =
        $('writer-paper').querySelector('textarea:focus') ||
        [...$('writer-paper').querySelectorAll('textarea')].find(
          (el) => doc.blocks.find((b) => b.id === selectedBlocks[0])?.id === el.dataset.block,
        );
      if (!field) return;
      const a = field.selectionStart,
        b = field.selectionEnd;
      field.setRangeText(marker + field.value.slice(a, b) + marker, a, b, 'select');
      field.dispatchEvent(new Event('input'));
      field.focus();
    };
  $('writer-paper').addEventListener('mouseup', () => {
    if (!editing) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && $('writer-paper').contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        const ids = [...$('writer-paper').querySelectorAll('.writer-block:not(.writer-removed)')]
          .filter((el) => range.intersectsNode(el))
          .map((el) => el.dataset.block)
          .slice(0, 100);
        if (ids.length) rememberSelection(ids, selection.toString(), range);
        else clearSelection();
      } else clearSelection();
    }
  });
  for (const action of ['undo', 'redo'])
    $('writer-' + action).onclick = () =>
      run(async () => {
        await flush();
        stopAuto();
        if (!doc) return;
        await command(action, { id: doc.id, base_version: doc.version });
        doc = await command('get', { id: doc.id, include_removed: true });
        await refreshTree();
        renderPreview();
        if (embeddedActive) await syncFile();
        status(
          action === 'undo'
            ? 'Alteração desfeita e registrada.'
            : 'Alteração refeita e registrada.',
        );
      });
  $('writer-rename').onclick = () =>
    run(async () => {
      if (!doc) return;
      const value = await ask('Renomear arquivo', doc.title);
      if (value) await structure('rename', { title: value.title });
    });
  $('writer-delete').onclick = () => run(() => structure('delete'));
  $('writer-move').onclick = () =>
    run(async () => {
      await flush();
      if (!doc) return;
      stopAuto();
      const select = $('writer-move-parent');
      select.replaceChildren();
      select.add(new Option('Raiz do Writer', ''));
      const excluded = new Set([doc.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of catalog.nodes)
          if (excluded.has(n.parent) && !excluded.has(n.id)) {
            excluded.add(n.id);
            changed = true;
          }
      }
      for (const n of catalog.nodes.filter((n) => !n.deleted && !excluded.has(n.id)))
        select.add(new Option(n.title, n.id));
      select.value = doc.parent || '';
      moveDialog.showModal();
    });
  $('writer-move-close').onclick = () => moveDialog.close();
  $('writer-move-prepare').onclick = () =>
    run(async () => {
      const parentId = $('writer-move-parent').value || null;
      moveDialog.close();
      await structure('move', { parentId, position: catalog.nodes.length + 1 });
    });
  $('writer-duplicate').onclick = () =>
    run(async () => {
      await flush();
      if (!doc || doc.kind === 'folder') return;
      const value = await ask('Nome da cópia', doc.title.replace(/\.docx$/i, '') + ' cópia.docx');
      if (!value) return;
      const node = await command('create', {
        title: value.title,
        kind: doc.kind,
        parentId: doc.parent,
      });
      await command('save', {
        id: node.id,
        base_version: node.version,
        blocks: doc.blocks.map((b) => ({ ...b, id: uid() })),
        request_id: uid(),
      });
      await load(node.id);
    });
  $('writer-settings').onclick = () => {
    stopAuto();
    fillSettings();
    settingsDialog.showModal();
  };
  $('writer-settings-close').onclick = () => settingsDialog.close();
  $('writer-settings-save').onclick = () =>
    run(async () => {
      const result = await command('settings', {
        cloud_consent: $('writer-consent').checked,
        auto_write: $('writer-auto').checked,
        linguistic: $('writer-linguistic').checked,
        style: $('writer-style').value,
        cancel_seconds: Number($('writer-delay').value),
        retention: Number($('writer-retention').value),
        width: $('writer-width').value,
      });
      catalog.settings = result;
      root.dataset.width = result.width;
      settingsDialog.close();
      status('Preferências deste projeto salvas.');
    });
  $('writer-prune').onclick = () =>
    run(async () => {
      const value = await ask(
        'Limpar revisões manuais antigas',
        '',
        false,
        'Digite LIMPAR para remover apenas versões manuais antigas além da retenção configurada. Revisões importantes serão preservadas.',
      );
      if (value?.title === 'LIMPAR') {
        const result = await command('prune', { confirmed: true });
        $('writer-settings-status').textContent =
          result.removed + ' revisões manuais removidas; importantes preservadas.';
      }
    });
  $('writer-history').onclick = () =>
    run(async () => {
      await flush();
      if (!doc) return;
      stopAuto();
      const revisions = await command('history', { id: doc.id });
      $('writer-revisions').replaceChildren();
      for (const item of revisions)
        $('writer-revisions').add(
          new Option(
            'Versão ' +
              item.version +
              ' · ' +
              item.operation +
              ' · ' +
              new Date(item.created).toLocaleString(),
            item.id,
          ),
        );
      historyDialog.showModal();
      await showRevision();
    });
  async function showRevision() {
    if (!$('writer-revisions').value) return;
    const revision = await command('revision', {
      id: doc.id,
      revision_id: Number($('writer-revisions').value),
    });
    const text = (snapshot) => snapshot?.blocks.map((b) => b.text).join('\n\n') || '(vazio)';
    $('writer-history-before').textContent = text(revision.before);
    $('writer-history-after').textContent = text(revision.after);
    $('writer-history-original').textContent = revision.original
      ? 'Mensagem original: ' + revision.original
      : '';
  }
  $('writer-revisions').onchange = () => run(showRevision);
  $('writer-history-close').onclick = () => historyDialog.close();
  $('writer-restore').onclick = () =>
    run(async () => {
      const confirm = await ask(
        'Restaurar versão',
        '',
        false,
        'Digite RESTAURAR. Uma nova revisão será criada; as anteriores permanecerão recuperáveis.',
      );
      if (confirm?.title !== 'RESTAURAR') return;
      await command('restore', {
        id: doc.id,
        base_version: doc.version,
        revision_id: Number($('writer-revisions').value),
      });
      historyDialog.close();
      await load(doc.id);
      if (embeddedActive) await syncFile();
    });
  $('writer-export').onclick = () =>
    run(async () => {
      await flush();
      stopAuto();
      const items = $('writer-export-items');
      items.replaceChildren();
      for (const n of catalog.nodes.filter((n) => !n.deleted && n.kind !== 'folder')) {
        const label = document.createElement('label'),
          box = document.createElement('input');
        box.type = 'checkbox';
        box.value = n.id;
        box.checked = n.id === doc?.id;
        label.append(box, document.createTextNode(n.title));
        items.append(label);
      }
      $('writer-export-scope').value = doc && !doc.deleted ? 'current' : 'all';
      $('writer-export-selection').hidden = true;
      exportDialog.showModal();
    });
  $('writer-export-scope').onchange = () => {
    $('writer-export-selection').hidden = $('writer-export-scope').value !== 'selection';
  };
  $('writer-export-close').onclick = () => exportDialog.close();
  $('writer-export-save').onclick = () =>
    run(async () => {
      const scope = $('writer-export-scope').value,
        format = $('writer-export-format').value;
      const ids =
        scope === 'all'
          ? []
          : scope === 'current'
            ? [doc.id]
            : [...$('writer-export-items').querySelectorAll('input:checked')].map((el) => el.value);
      if (scope !== 'all' && !ids.length)
        throw Error('Selecione pelo menos um capítulo ou documento.');
      const button = $('writer-export-save');
      button.disabled = true;
      try {
        const result = await bridge.export({ project_id: project.id, document_ids: ids, format });
        exportDialog.close();
        status(result.saved ? 'Exportado: ' + result.name : 'Exportação cancelada.');
      } finally {
        button.disabled = false;
      }
    });
  $('writer-trash').onclick = () => {
    showRemoved = !showRemoved;
    tree();
  };
  $('writer-selection').onclick = () => {
    clearSelection();
    window.getSelection()?.removeAllRanges();
    for (const field of $('writer-paper').querySelectorAll('textarea'))
      if (field.selectionStart !== field.selectionEnd)
        field.setSelectionRange(field.selectionEnd, field.selectionEnd);
  };
  $('writer-toggle-files').onclick = () => root.classList.toggle('writer-files-visible');
  $('writer-toggle-preview').onclick = () => {
    if (window.innerWidth <= 620) {
      root.classList.add('writer-mobile-preview');
      return;
    }
    const hidden = root.classList.toggle('writer-preview-collapsed');
    $('writer-toggle-preview').setAttribute('aria-expanded', String(!hidden));
  };
  $('writer-collapse-assistant').onclick = () => {
    if (embedded) {
      const expanded = layout.classList.toggle('document-expanded');
      $('writer-collapse-assistant').setAttribute('aria-pressed', String(expanded));
      return;
    }
    if (window.innerWidth <= 620) {
      root.classList.remove('writer-mobile-preview');
      root.classList.remove('writer-reading');
      return;
    }
    const expanded = root.classList.toggle('writer-reading');
    $('writer-collapse-assistant').setAttribute('aria-pressed', String(expanded));
  };
  async function syncFile() {
    if (!bridge.file || !doc || doc.deleted) return;
    const result = await bridge.file({ project_id: project.id, action: 'sync', id: doc.id });
    if (!result.ok) {
      renderProposal();
      renderPreview();
      throw Error(
        result.data?.detail ||
          'Edição salva no Cyro, mas o arquivo original não foi atualizado. Exporte uma cópia para recuperar.',
      );
    }
    fileInfo = result.data;
    updateSaveState();
    status(
      result.data.linked
        ? 'Arquivo original atualizado. A versão anterior permanece nas revisões.'
        : 'Salvo no projeto. Use Exportar para criar um arquivo.',
    );
  }
  async function mount(activeProject, activeChat) {
    if (!embedded || !activeChat.writer_document_id) return;
    project = activeProject;
    catalog = await command('open');
    doc = null;
    fileInfo = null;
    embeddedActive = true;
    preview.hidden = false;
    writerStrip.hidden = false;
    layout.classList.add('has-writer-document');
    document.getElementById('attach-files').hidden = true;
    document.getElementById('composer-context').textContent = 'Arquivo vinculado · Cyro Writer';
    document.querySelector('.attachment-caption').hidden = true;
    await load(activeChat.writer_document_id);
    if (bridge.file) {
      const response = await bridge.file({ project_id: project.id, action: 'info', id: doc.id });
      if (!response.ok)
        throw Error(response.data?.detail || 'Não foi possível verificar o arquivo.');
      fileInfo = response.data;
      $('writer-save-file').hidden = !fileInfo.linked;
      updateSaveState();
    }
    window.jarvisUI?.welcome(false);
    const archived = !!activeChat.archived;
    for (const id of [
      'writer-edit',
      'writer-undo',
      'writer-redo',
      'writer-save-file',
      'writer-approve',
      'writer-reject',
      'writer-adjust',
      'writer-apply-adjusted',
      'writer-restore',
    ]) {
      $(id).disabled = archived;
    }
    if (!archived) renderProposal();
  }
  async function unmount() {
    if (!embeddedActive) return;
    await flush();
    stopAuto();
    if (assistantBusy) await bridge.cancel(project.id);
    generation++;
    embeddedActive = false;
    doc = null;
    proposal = null;
    preview.hidden = true;
    writerStrip.hidden = true;
    $('writer-proposal').hidden = true;
    layout.classList.remove('has-writer-document', 'document-expanded');
    document.getElementById('attach-files').hidden = false;
    document.getElementById('composer-context').innerHTML = originalContext;
    document.querySelector('.attachment-caption').hidden = false;
    $('writer-send').title = 'Enviar mensagem';
    $('writer-send').setAttribute('aria-label', 'Enviar mensagem');
    bridge.dirty(false);
  }
  const fileChoice = document.createElement('dialog');
  fileChoice.setAttribute('aria-labelledby', 'writer-file-choice-title');
  fileChoice.innerHTML =
    '<h3 id="writer-file-choice-title">Arquivo desta conversa</h3><p>Crie um arquivo ou escolha um documento do computador. Alterações aprovadas atualizam o original; perguntas não alteram o conteúdo.</p><button data-choice="new">Criar arquivo</button><button data-choice="existing">Escolher arquivo</button><div id="writer-existing-files"></div><button data-choice="cancel">Cancelar</button><p id="writer-file-choice-error" role="status"></p>';
  document.body.append(fileChoice);
  async function createChat() {
    project = window.jarvisWorkspace?.project;
    if (!project) throw Error('Abra um projeto primeiro.');
    catalog = await command('open');
    const previous = document.getElementById('writer-existing-files');
    previous.replaceChildren();
    const enter = async (chat) => {
      fileChoice.close();
      await window.jarvisWorkspace.catalog(project.id, chat.id);
    };
    for (const node of catalog.nodes.filter((n) => !n.deleted && n.kind !== 'folder')) {
      const entry = document.createElement('button');
      entry.textContent = 'Continuar: ' + node.title;
      entry.onclick = () => run(async () => enter(await command('bind_chat', { id: node.id })));
      previous.append(entry);
    }
    fileChoice.querySelectorAll('[data-choice]').forEach(
      (button) =>
        (button.onclick = async () => {
          if (button.dataset.choice === 'cancel') {
            fileChoice.close();
            return;
          }
          button.disabled = true;
          try {
            const result = await bridge.chooseFile({
              project_id: project.id,
              create: button.dataset.choice === 'new',
            });
            if (!result.cancelled) await enter(result.chat);
          } catch (error) {
            document.getElementById('writer-file-choice-error').textContent = error.message;
          } finally {
            button.disabled = false;
          }
        }),
    );
    document.getElementById('writer-file-choice-error').textContent = '';
    fileChoice.showModal();
  }
  window.jarvisWriterUI = {
    open,
    mount,
    unmount,
    createChat,
    submit: () => run(() => send()),
    cancel: () => run(() => bridge.cancel(project.id)),
    get embeddedActive() {
      return embeddedActive;
    },
    flush,
    get active() {
      return doc;
    },
  };
})();
