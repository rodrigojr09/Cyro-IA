import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { proxyCompletion } from "../lib/proxy";
const options = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "test" }],
  store: false,
};
test("proxy registra somente uso retornado pelo provedor", async () => {
  let recorded: unknown;
  let sent: unknown;
  const provider = {
    chat: {
      completions: {
        create: async (input: unknown) => {
          sent = input;
          return {
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          };
        },
      },
    },
  } as unknown as OpenAI;
  const response = await proxyCompletion(
    provider,
    options,
    false,
    new AbortController().signal,
    async (usage) => {
      recorded = usage;
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(recorded, { prompt_tokens: 10, completion_tokens: 20 });
  assert.equal((sent as { store: boolean }).store, false);
});
test("streaming preserva deltas, finaliza uso uma vez e envia DONE", async () => {
  let count = 0;
  let recorded: unknown;
  const controller = new AbortController();
  const stream = Object.assign(
    (async function* () {
      yield { choices: [{ delta: { content: "Olá" } }], usage: null };
      yield { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } };
    })(),
    { controller },
  );
  const provider = {
    chat: {
      completions: {
        create: async (input: { stream_options: unknown }) => {
          assert.deepEqual(input.stream_options, { include_usage: true });
          return stream;
        },
      },
    },
  } as unknown as OpenAI;
  const response = await proxyCompletion(
    provider,
    options,
    true,
    controller.signal,
    async (usage) => {
      recorded = usage;
      count++;
    },
  );
  const text = await response.text();
  assert.match(text, /Olá/);
  assert.match(text, /\[DONE\]/);
  assert.equal(count, 1);
  assert.deepEqual(recorded, { prompt_tokens: 3, completion_tokens: 2 });
});
test("falha do provedor registra uso desconhecido sem inventar tokens", async () => {
  let recorded: unknown = "not-called";
  const provider = {
    chat: {
      completions: {
        create: async () => {
          throw Error("mock-provider-failed");
        },
      },
    },
  } as unknown as OpenAI;
  await assert.rejects(
    proxyCompletion(
      provider,
      options,
      true,
      new AbortController().signal,
      async (usage) => {
        recorded = usage;
      },
    ),
  );
  assert.equal(recorded, null);
});
test("cancelamento é propagado ao provedor", async () => {
  const controller = new AbortController();
  let calls = 0;
  const stream = Object.assign(
    (async function* () {
      yield { choices: [{ delta: { content: "partial" } }] };
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (controller.signal.aborted) throw Error("cancelled");
    })(),
    { controller },
  );
  const provider = {
    chat: { completions: { create: async () => stream } },
  } as unknown as OpenAI;
  const response = await proxyCompletion(
    provider,
    options,
    true,
    new AbortController().signal,
    async () => {
      calls++;
    },
  );
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(controller.signal.aborted);
  assert.equal(calls, 1);
});
