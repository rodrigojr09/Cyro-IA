const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
function fixture() {
  const dom = new JSDOM('<button id="writer-open"></button>', {
    runScripts: 'outside-only',
    url: 'https://local.invalid',
  });
  const w = dom.window,
    calls = [],
    exported = [],
    dirties = [];
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function (value) {
    this.returnValue = value;
    this.open = false;
    this.dispatchEvent(new w.Event('close'));
  };
  const project = { id: randomUUID(), name: 'Livro' };
  const document = {
    id: randomUUID(),
    title: 'História.docx',
    kind: 'document',
    parent: null,
    version: 1,
    deleted: 0,
    updated: new Date().toISOString(),
    blocks: [{ id: randomUUID(), type: 'paragraph', text: 'Lucas abriu a porta.' }],
  };
  const settings = {
    cloud_consent: true,
    auto_write: false,
    linguistic: true,
    cancel_seconds: 3,
    retention: 200,
    width: 'comfortable',
    style: '',
  };
  let failure = false,
    conflict = false,
    cloudFailure = false,
    pending = null;
  w.jarvisWorkspace = { project };
  w.jarvisWriter = {
    command: async (value) => {
      calls.push(structuredClone(value));
      const p = value.payload;
      if (value.action === 'open')
        return { ok: true, data: { nodes: [structuredClone(document)], settings } };
      if (value.action === 'get') return { ok: true, data: structuredClone(document) };
      if (value.action === 'messages') return { ok: true, data: [] };
      if (value.action === 'save') {
        if (failure) return { ok: false, data: { detail: 'Conflito de versão' } };
        document.blocks = structuredClone(p.blocks);
        document.version++;
        return { ok: true, data: { id: document.id, version: document.version } };
      }
      if (value.action === 'assist') {
        if (cloudFailure) return { ok: false, data: { detail: 'Cloud indisponível' } };
        pending = {
          id: randomUUID(),
          node: document.id,
          base: document.version,
          state: 'PENDING',
          intent: 'INSTRUCT',
          auto: false,
          instruction: p.message,
          original: structuredClone(document),
          plan: {
            operation: 'replace',
            targetDocumentId: document.id,
            blockIds: [document.blocks[0].id],
            blocks: [{ id: randomUUID(), type: 'paragraph', text: 'Lucas abriu a antiga porta.' }],
          },
        };
        return {
          ok: true,
          data: {
            intent: 'INSTRUCT',
            reply: 'Revise a proposta.',
            proposal: pending,
            context_notice: 'Documento inteiro considerado.',
          },
        };
      }
      if (value.action === 'decide') {
        if (conflict) return { ok: true, data: { state: 'CONFLICTED', message: 'Versão mudou' } };
        if (p.approve) {
          document.blocks = structuredClone(p.edited_blocks || pending.plan.blocks);
          document.version++;
        }
        return {
          ok: true,
          data: {
            state: p.approve ? 'APPLIED' : 'REJECTED',
            id: document.id,
            version: document.version,
          },
        };
      }
      if (value.action === 'create') {
        document.title = p.title;
        document.kind = p.kind;
        return { ok: true, data: structuredClone(document) };
      }
      throw Error('Unexpected action ' + value.action);
    },
    cancel: async () => {},
    dirty: async (value) => dirties.push(value),
    export: async (value) => {
      exported.push(value);
      return { saved: true, name: document.title };
    },
  };
  w.eval(fs.readFileSync(path.join(__dirname, 'writer-ui.js'), 'utf8'));
  return {
    dom,
    w,
    document,
    calls,
    exported,
    dirties,
    get: (id) => w.document.getElementById(id),
    fail: () => (failure = true),
    conflict: () => (conflict = true),
    failCloud: () => (cloudFailure = true),
    recover: () => (failure = false),
  };
}
test('Writer: conversa central, prévia à direita e diff azul sem aplicar antes da aprovação', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    assert(f.get('writer-dialog').querySelector('.writer-preview'));
    f.get('writer-input').value = 'Deixe a porta mais antiga.';
    f.get('writer-send').click();
    await pause();
    assert.equal(f.get('writer-proposal').hidden, false);
    assert.match(f.get('writer-paper').querySelector('mark').textContent, /antiga/);
    assert.equal(f.document.blocks[0].text, 'Lucas abriu a porta.');
    f.get('writer-approve').click();
    await pause();
    assert.equal(f.document.blocks[0].text, 'Lucas abriu a antiga porta.');
    assert.equal(f.get('writer-proposal').hidden, true);
  } finally {
    f.dom.window.close();
  }
});
test('Writer: limpar seleção usa documento inteiro e mostra o escopo considerado', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    assert.equal(f.get('writer-selection').textContent, 'Documento inteiro');
    f.get('writer-paper').querySelector('.writer-block').click();
    assert.equal(f.get('writer-selection').textContent, 'Trecho selecionado');
    f.get('writer-selection').click();
    f.get('writer-input').value = 'Revise o documento.';
    f.get('writer-send').click();
    await pause();
    assert.deepEqual(f.calls.find((c) => c.action === 'assist').payload.selected_block_ids, []);
    assert.equal(
      f.get('writer-messages').querySelector('.writer-context-note').textContent,
      'Documento inteiro considerado.',
    );
  } finally {
    f.dom.window.close();
  }
});
test('Writer: próxima mensagem aprova a anterior uma vez antes de consultar a IA', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    f.get('writer-input').value = 'Revise a porta.';
    f.get('writer-send').click();
    await pause();
    assert.match(f.get('writer-proposal-reason').textContent, /próxima mensagem aprova/);
    f.get('writer-input').value = 'Agora continue o texto.';
    f.get('writer-send').click();
    f.get('writer-send').click();
    await pause();
    const decisions = f.calls.filter((c) => c.action === 'decide');
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].payload.approve, true);
    assert.equal(decisions[0].payload.automatic, false);
    const assists = f.calls.filter((c) => c.action === 'assist');
    assert.equal(assists.length, 2);
    assert.equal(assists[1].payload.base_version, 2);
    assert.equal(f.document.blocks[0].text, 'Lucas abriu a antiga porta.');
    assert(f.calls.indexOf(decisions[0]) < f.calls.indexOf(assists[1]));
  } finally {
    f.dom.window.close();
  }
});
test('Writer: conflito impede aprovar e enviar a próxima mensagem', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    f.get('writer-input').value = 'Revise a porta.';
    f.get('writer-send').click();
    await pause();
    f.conflict();
    f.get('writer-input').value = 'Continue.';
    f.get('writer-send').click();
    await pause();
    assert.equal(f.calls.filter((c) => c.action === 'assist').length, 1);
    assert.equal(f.document.blocks[0].text, 'Lucas abriu a porta.');
    assert.equal(f.get('writer-input').value, 'Continue.');
    assert.match(f.get('writer-status').textContent, /não foi aplicada/);
  } finally {
    f.dom.window.close();
  }
});
test('Writer: continuar aprova o ajuste editado e preserva aprovação se o Cloud falhar', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    f.get('writer-input').value = 'Revise a porta.';
    f.get('writer-send').click();
    await pause();
    f.get('writer-adjust').click();
    f.get('writer-adjust-text').value = 'Minha versão ajustada.';
    f.get('writer-adjust-text').dispatchEvent(new f.w.Event('input'));
    f.failCloud();
    f.get('writer-input').value = 'Continue a partir disso.';
    f.get('writer-send').click();
    await pause();
    assert.equal(f.document.blocks[0].text, 'Minha versão ajustada.');
    assert.equal(f.get('writer-input').value, 'Continue a partir disso.');
    assert.match(f.get('writer-status').textContent, /Cloud indisponível/);
    assert.equal(f.get('writer-messages').querySelectorAll('.writer-message.user').length, 1);
  } finally {
    f.dom.window.close();
  }
});
test('Writer: edição manual salva sem IA; falha preserva texto e impede fechamento', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    f.get('writer-edit').click();
    await pause();
    const field = f.get('writer-paper').querySelector('textarea');
    field.value = 'Edição manual independente.';
    field.dispatchEvent(new f.w.Event('input'));
    await f.w.jarvisWriterUI.flush();
    assert.equal(f.document.blocks[0].text, field.value);
    assert.equal(f.calls.filter((c) => c.action === 'assist').length, 0);
    f.fail();
    field.value = 'Meu texto ainda não salvo.';
    field.dispatchEvent(new f.w.Event('input'));
    await assert.rejects(f.w.jarvisWriterUI.flush(), /edição pendente/);
    f.get('writer-close').click();
    await pause();
    assert.equal(f.get('writer-dialog').open, true);
    assert.equal(field.value, 'Meu texto ainda não salvo.');
    assert(f.dirties.includes(true));
    f.get('writer-compare-save').click();
    await pause();
    assert.match(f.get('writer-conflict-draft').textContent, /Meu texto ainda não salvo/);
    f.recover();
    f.get('writer-conflict-apply').click();
    await pause(450);
    await f.w.jarvisWriterUI.flush();
    assert.equal(f.document.blocks[0].text, 'Meu texto ainda não salvo.');
  } finally {
    f.dom.window.close();
  }
});
test('Writer: criação pede nome do arquivo e exportação oferece seleção real', async () => {
  const f = fixture();
  try {
    await f.w.jarvisWriterUI.open();
    f.get('writer-new').click();
    await pause();
    assert.equal(f.get('writer-prompt').open, true);
    f.get('writer-prompt-value').value = 'Meu capítulo';
    f.get('writer-prompt').close('ok');
    await pause();
    assert.equal(f.document.title, 'Meu capítulo.docx');
    f.get('writer-export').click();
    await pause();
    f.get('writer-export-scope').value = 'selection';
    f.get('writer-export-scope').dispatchEvent(new f.w.Event('change'));
    assert.equal(f.get('writer-export-selection').hidden, false);
    f.get('writer-export-save').click();
    await pause();
    assert.deepEqual(Array.from(f.exported[0].document_ids), [f.document.id]);
    assert.equal(f.exported[0].format, 'docx');
  } finally {
    f.dom.window.close();
  }
});
test('Writer: indisponível fora de projeto e conteúdo HTML permanece texto', async () => {
  const f = fixture();
  try {
    f.w.jarvisWorkspace.project = null;
    await assert.rejects(f.w.jarvisWriterUI.open(), /exclusivo dos projetos/);
    f.w.jarvisWorkspace.project = { id: randomUUID(), name: 'Livro' };
    f.document.blocks[0].text = '<img src=x onerror="alert(1)">';
    await f.w.jarvisWriterUI.open();
    assert.equal(f.get('writer-paper').querySelector('img'), null);
    assert.match(f.get('writer-paper').textContent, /<img/);
  } finally {
    f.dom.window.close();
  }
});
