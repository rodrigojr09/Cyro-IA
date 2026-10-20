const { test } = require('node:test');
const assert = require('node:assert/strict');
const { consume } = require('./local-stream');
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
