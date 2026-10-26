import OpenAI from "openai";
import { db } from "./db";
import { HttpError } from "./http";
import { reserve, settle } from "./budget";
import { openAISettings } from "./provider-settings";
import { rateLimit } from "./rate-limit";
import { requireStorage } from "./storage";
import { SPOTIFY_INTENT_SYSTEM, SPOTIFY_INTENT_TOOL } from "./spotify-intent";

type Usage = { prompt_tokens: number; completion_tokens: number };
export function createSpotifyInterpreter(
  deps = {
    settings: () => db.systemSettings.findUnique({ where: { id: "global" } }),
    provider: openAISettings,
    reserve,
    settle,
    storage: requireStorage,
    rateLimit,
    client: (apiKey: string) =>
      new OpenAI({ apiKey, timeout: 20000, maxRetries: 0 }),
  },
) {
  return async (
    text: string,
    session: { userId: string; id: string },
    signal: AbortSignal,
    selecting = false,
  ): Promise<unknown> => {
    await deps.storage(session.userId);
    await deps.rateLimit(`spotify-intent:${session.userId}`, 10, 60);
    const settings = await deps.settings();
    if (settings && !settings.intelligenceEnabled)
      throw new HttpError(
        403,
        "Inteligência artificial suspensa pelo administrador.",
      );
    const provider = await deps.provider();
    const model = provider.allowedModels[0];
    if (!provider.apiKey || !model)
      throw new HttpError(
        503,
        "Configure a IA do Cloud para interpretar este comando musical.",
      );
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          SPOTIFY_INTENT_SYSTEM +
          (selecting
            ? "\nO humano está respondendo à pergunta de escolha de dispositivo no chat. Se ele nomear um aparelho, classifique select_device com o nome que ele digitou. Sem nome inequívoco, peça esclarecimento; conversa não é seleção."
            : ""),
      },
      { role: "user", content: text },
    ];
    const maxTokens = Math.min(512, settings?.maxOutputTokens ?? 3500);
    const reservation = await deps.reserve(
      session.userId,
      Buffer.byteLength(JSON.stringify(messages)) +
        Buffer.byteLength(JSON.stringify(SPOTIFY_INTENT_TOOL)) +
        maxTokens +
        1024,
    );
    let usage: Usage | null = null;
    try {
      const response = await deps
        .client(provider.apiKey)
        .chat.completions.create(
          {
            model,
            messages,
            tools: [SPOTIFY_INTENT_TOOL],
            tool_choice: {
              type: "function",
              function: { name: SPOTIFY_INTENT_TOOL.function.name },
            },
            parallel_tool_calls: false,
            max_completion_tokens: maxTokens,
            store: false,
          },
          { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) },
        );
      usage = response.usage ?? null;
      const calls = response.choices[0]?.message.tool_calls;
      if (
        calls?.length !== 1 ||
        calls[0].type !== "function" ||
        calls[0].function.name !== SPOTIFY_INTENT_TOOL.function.name ||
        response.choices[0].finish_reason !== "tool_calls"
      )
        return null;
      try {
        return JSON.parse(calls[0].function.arguments);
      } catch {
        return null;
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        "Não consegui interpretar o comando musical agora. Tente reformular ou confira a conexão Spotify.",
      );
    } finally {
      await deps.settle(reservation, session.id, model, usage);
    }
  };
}
export const interpretSpotifyCommand = createSpotifyInterpreter();
