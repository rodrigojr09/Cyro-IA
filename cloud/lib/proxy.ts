import type OpenAI from "openai";
type Usage = { prompt_tokens: number; completion_tokens: number };
export async function proxyCompletion(
  provider: Pick<OpenAI, "chat">,
  options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  streaming: boolean,
  signal: AbortSignal,
  record: (usage: Usage | null) => Promise<void>,
) {
  let usage: Usage | null = null;
  let recorded = false;
  async function finalize() {
    if (!recorded) {
      recorded = true;
      await record(usage);
    }
  }
  if (!streaming) {
    try {
      const result = await provider.chat.completions.create(
        { ...options, stream: false },
        { signal },
      );
      usage = result.usage ?? null;
      return Response.json(result);
    } finally {
      await finalize();
    }
  }
  let upstream;
  try {
    upstream = await provider.chat.completions.create(
      { ...options, stream: true, stream_options: { include_usage: true } },
      { signal },
    );
  } catch (error) {
    await finalize();
    throw error;
  }
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of upstream) {
            if (chunk.usage) usage = chunk.usage;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
            );
          }
          await finalize();
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          upstream.controller.abort();
          await finalize().catch(() => {});
          try {
            controller.error(new Error("Transmissão interrompida."));
          } catch {}
        }
      },
      cancel() {
        upstream.controller.abort();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
