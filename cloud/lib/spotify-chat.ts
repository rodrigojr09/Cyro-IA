import { HttpError } from "./http";
import { resolveSpotifyIntent, normalizeDeviceName } from "./spotify-intent";
import { spotifyReply } from "./spotify-command";
import type { SpotifyAction } from "./spotify";
type Device = {
  id: string;
  name: string;
  active?: boolean;
  restricted?: boolean;
};
export type SpotifyChatReply =
  | {
      handled: false;
      reply?: never;
      speech?: never;
      devicePrompt?: never;
      resumeAfterSelection?: never;
    }
  | {
      handled: true;
      reply: string;
      speech: string;
      devicePrompt?: boolean;
      resumeAfterSelection?: boolean;
    };
export async function handleSpotifyChat(
  text: string,
  deps: {
    classify: (text: string, selecting?: boolean) => Promise<unknown>;
    execute: (command: SpotifyAction) => Promise<any>;
    selecting?: boolean;
    resumeAfterSelection?: boolean;
  },
): Promise<SpotifyChatReply> {
  const response = (reply: string) => ({
    handled: true as const,
    reply,
    speech: reply,
  });
  async function devices(): Promise<Device[]> {
    const result = await deps.execute({ action: "devices" });
    return (Array.isArray(result?.devices) ? result.devices : []).filter(
      (d: any) =>
        typeof d.id === "string" &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(d.id) &&
        typeof d.name === "string" &&
        !d.restricted,
    );
  }
  function ask(
    available: Device[],
    resume = false,
    prefix = "Não há um dispositivo Spotify ativo.",
  ) {
    return {
      ...response(
        prefix +
          " Em qual dispositivo você quer tocar?" +
          (available.length
            ? "\n" +
              available.map((d) => `• ${d.name}`).join("\n") +
              "\nResponda com o nome ou diga: usar dispositivo Spotify NOME."
            : " Abra o Spotify no aparelho desejado e informe o nome dele aqui."),
      ),
      devicePrompt: true,
      resumeAfterSelection: resume,
    };
  }
  async function select(name: string, available?: Device[]) {
    const all = available ?? (await devices());
    const matches = all.filter(
      (d) => normalizeDeviceName(d.name) === normalizeDeviceName(name),
    );
    if (matches.length !== 1)
      return ask(
        all,
        deps.resumeAfterSelection,
        "Não consegui identificar um único dispositivo com esse nome.",
      );
    const chosen = matches[0];
    if (!chosen.active)
      await deps.execute({ action: "transfer", deviceId: chosen.id });
    if (deps.resumeAfterSelection) {
      const result = await deps.execute({
        action: "resume",
        deviceId: chosen.id,
      });
      return response(spotifyReply({ action: "resume" }, result));
    }
    return response(
      chosen.active
        ? "Esse dispositivo já está ativo no Spotify. Vou continuar usando ele."
        : "Dispositivo selecionado no Spotify. Vou usar ele nos próximos comandos. Para tocar, diga: continuar Spotify.",
    );
  }
  try {
    let knownDevices: Device[] | undefined;
    if (
      deps.selecting &&
      text.trim().length <= 150 &&
      !/[\r\n`<>]/.test(text)
    ) {
      const available = (knownDevices = await devices());
      const matches = available.filter(
        (d) => normalizeDeviceName(d.name) === normalizeDeviceName(text),
      );
      if (matches.length === 1) return await select(text, available);
    }
    const intent = await resolveSpotifyIntent(
      text,
      deps.classify,
      deps.selecting,
    );
    if (intent.kind === "none") return { handled: false };
    if (intent.kind === "select_device")
      return await select(intent.name, knownDevices);
    if (intent.kind === "clarify")
      return response(
        "O que você quer fazer no Spotify: pausar, continuar, pular a faixa, consultar a música, escolher dispositivo ou ajustar o volume? Peça uma ação por vez.",
      );
    if (intent.kind === "unavailable")
      return response(
        "Busca por nome e playlists não estão disponíveis nesta integração. Use continuar, pausar, próxima, anterior ou escolha um dispositivo pelo chat.",
      );
    try {
      // Device activity, not is_playing, determines whether a choice is needed.
      if (
        [
          "pause",
          "resume",
          "next",
          "previous",
          "volume",
          "volume_delta",
        ].includes(intent.command.action)
      ) {
        const available = knownDevices ?? (await devices());
        if (!available.some((device) => device.active))
          return ask(available, intent.command.action === "resume");
      }
      const result = await deps.execute(intent.command);
      return {
        ...response(spotifyReply(intent.command, result)),
        ...(intent.command.action === "devices"
          ? { devicePrompt: true, resumeAfterSelection: false }
          : {}),
      };
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      const available = await devices();
      if (available.some((d) => d.active))
        return response(
          "O Spotify não conseguiu usar o dispositivo ativo. Abra o Spotify nele e tente novamente; não troquei de aparelho.",
        );
      return ask(available, intent.command.action === "resume");
    }
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return response(error.message);
  }
}
