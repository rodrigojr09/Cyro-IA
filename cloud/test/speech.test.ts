import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { speechError } from "../lib/speech-error";

test("voz distingue configuração, limite e timeout sem revelar erros do provedor", () => {
  for (const [upstream, status, text] of [
    [401, 502, "Configuração"],
    [403, 502, "Configuração"],
    [400, 502, "Configuração"],
    [404, 502, "Configuração"],
    [429, 503, "Limite ou saldo"],
    [500, 502, "Síntese"],
  ] as const) {
    const result = speechError(
      new OpenAI.APIError(
        upstream,
        { message: "private-provider-data" },
        "private-provider-data",
        new Headers(),
      ),
    );
    assert.equal(result.status, status);
    assert.ok(result.message.startsWith(text));
    assert.ok(!result.message.includes("private-provider-data"));
  }
  assert.equal(speechError(new OpenAI.APIConnectionTimeoutError()).status, 504);
  assert.equal(speechError(new Error("private-provider-data")).status, 502);
});
