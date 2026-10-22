const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

async function setup() {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'quick.html'), 'utf8'), {
    url: 'file:///quick.html?panel=composer',
    runScripts: 'outside-only',
  });
  const state = {
    config: { opacity: 0.62, voice: false },
    busy: false,
    masterVoice: true,
    question: '',
    answer: '',
    error: '',
  };
  const drafts = new Map();
  let update,
    resolve,
    reject,
    calls = 0;
  dom.window.jarvisStorage = {
    getItem: (key) => drafts.get(key),
    setItem: (key, value) => drafts.set(key, value),
    removeItem: (key) => drafts.delete(key),
  };
  dom.window.quick = {
    onStopAudio() {},
    onFocus() {},
    onState: (callback) => {
      update = callback;
    },
    state: async () => state,
    send: () => {
      calls++;
      return new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
    },
  };
  dom.window.eval(fs.readFileSync(path.join(__dirname, 'quick-renderer.js'), 'utf8'));
  await Promise.resolve();
  const question = dom.window.document.getElementById('question');
  question.value = 'Minha pergunta';
  question.oninput();
  return {
    dom,
    question,
    drafts,
    submit: () => dom.window.document.getElementById('send').onclick(),
    update: (extra) => update({ ...state, ...extra }),
    resolve: (value) => resolve(value),
    reject: () => reject(Error('offline')),
    calls: () => calls,
  };
}

test('envio limpa campo e rascunho imediatamente e impede envio duplicado', async () => {
  const f = await setup();
  try {
    const pending = f.submit();
    assert.equal(f.question.value, '');
    assert.equal(f.drafts.size, 0);
    f.question.value = 'Nova pergunta';
    await f.submit();
    assert.equal(f.calls(), 1);
    f.resolve({ ok: true });
    await pending;
    assert.equal(f.question.value, 'Nova pergunta');
  } finally {
    f.dom.window.close();
  }
});

test('erro de envio recupera pergunta e rascunho para tentar novamente', async () => {
  for (const rejected of [false, true]) {
    const f = await setup();
    try {
      const pending = f.submit();
      if (rejected) f.reject();
      else f.resolve({ ok: false });
      await pending;
      assert.equal(f.question.value, 'Minha pergunta');
      assert.equal(f.drafts.get('jarvis.quick.draft'), 'Minha pergunta');
    } finally {
      f.dom.window.close();
    }
  }
});

test('falha de voz após resposta não recoloca a pergunta já enviada', async () => {
  const f = await setup();
  try {
    const pending = f.submit();
    f.resolve({ ok: true });
    await pending;
    f.update({
      error: 'Áudio indisponível',
      answer: 'Resposta pronta',
      question: 'Minha pergunta',
    });
    assert.equal(f.question.value, '');
    assert.equal(f.drafts.size, 0);
  } finally {
    f.dom.window.close();
  }
});
