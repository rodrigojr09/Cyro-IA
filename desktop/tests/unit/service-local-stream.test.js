const { test } = require('node:test');
const assert = require('node:assert/strict');
const { consume } = require('../../scripts/chat/local-stream');
test('stream local recompõe eventos partidos e UTF-8', async () => {
  const bytes = new TextEncoder().encode(
    'data: {"delta":"Olá"}\n\ndata: {"result":{"reply":"Olá"}}\n\n',
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2));
        controller.close();
      },
    }),
  );
  let text = '';
  const result = await consume(response, (value) => {
    text += value;
  });
  assert.equal(text, 'Olá');
  assert.equal(result.data.reply, 'Olá');
  assert.ok(result.ok);
});
test('stream interrompido não inventa resposta concluída', async () => {
  await assert.rejects(consume(new Response('data: {"delta":"partial"}\n\n'), () => {}));
});

test('erro 413 do servidor preserva o aviso de tamanho antes do streaming', async () => {
  const result = await consume(
    new Response(JSON.stringify({ detail: 'O projeto ultrapassa 5 MB.' }), { status: 413 }),
    () => assert.fail('Nenhum delta esperado'),
  );
  assert.equal(result.ok, false);
  assert.match(result.data.detail, /5 MB/);
});
