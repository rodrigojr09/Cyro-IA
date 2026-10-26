import type { SpotifyAction } from "./spotify";
/** Only standalone human commands; quoted text and broad project prompts never execute. */
export function parseSpotifyCommand(
  text: string,
): SpotifyAction | "unavailable" | null {
  const addressed = /^jarvis[,! ]+/i.test(text.trim());
  const value = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^jarvis[,! ]+/, "")
    .replace(/[.!?]+$/, "")
    .trim();
  const entries: [RegExp, SpotifyAction][] = [
    [
      /^(?:spotify[, ]+)?(?:pausa|pause|pausar)(?: (?:a )?musica| (?:o )?spotify| (?:a )?reproducao)?$/,
      { action: "pause" },
    ],
    [
      /^(?:spotify[, ]+)?(?:continua|continue|continuar|retoma|retome)(?: (?:a )?musica| (?:o )?spotify| (?:a )?reproducao)?$/,
      { action: "resume" },
    ],
    [
      /^(?:spotify[, ]+)?(?:proxima(?: musica)?|pula a musica|pule a musica)$/,
      { action: "next" },
    ],
    [
      /^(?:spotify[, ]+)?(?:musica anterior|anterior|volta a musica anterior|volte a musica anterior)$/,
      { action: "previous" },
    ],
    [
      /^(?:qual musica esta tocando|que musica e essa|o que esta tocando|qual a musica atual)(?: no spotify)?$/,
      { action: "currently_playing" },
    ],
    [
      /^(?:(?:mostra|mostre|liste) (?:meus |os )?)?dispositivos spotify$/,
      { action: "devices" },
    ],
    [
      /^(?:aumenta|aumente) o volume(?: do spotify)?$/,
      { action: "volume_delta", delta: 10 },
    ],
    [
      /^(?:diminui|diminua|abaixa|abaixe) o volume(?: do spotify)?$/,
      { action: "volume_delta", delta: -10 },
    ],
  ];
  for (const [pattern, action] of entries)
    if (pattern.test(value)) {
      if (
        ["pause", "resume"].includes(action.action) &&
        !/spotify|musica|reproducao/.test(value)
      )
        return null;
      if (
        ["next", "previous"].includes(action.action) &&
        !addressed &&
        !/musica|spotify/.test(value)
      )
        return null;
      return action;
    }
  const volume = value.match(
    /^(?:(?:coloca|coloque|ajusta|ajuste) (?:o )?)?volume(?: do spotify)? (?:em |para )?(\d{1,3})(?:%| por cento)?$/,
  );
  if (volume && Number(volume[1]) <= 100)
    return { action: "volume", volume: Number(volume[1]) };
  if (
    /^(?:toca|toque|coloca|coloque) (?:uma musica|a musica|minha playlist|a playlist|musicas de)\b/.test(
      value,
    )
  )
    return "unavailable";
  return null;
}
export function spotifyReply(action: SpotifyAction, result: any): string {
  if (result?.accepted)
    return "Comando recebido pelo Spotify. A reprodução pode levar alguns instantes para atualizar.";
  if (action.action === "devices")
    return result.devices.length
      ? "Dispositivos Spotify:\n" +
          result.devices
            .map(
              (d: any) =>
                `${d.name}${d.active ? " (ativo)" : ""}${d.restricted ? " (restrito)" : ""}`,
            )
            .join("\n") +
          "\nPara selecionar, diga: usar dispositivo Spotify NOME."
      : "Nenhum dispositivo disponível. Abra o Spotify em um dispositivo e tente novamente.";
  if (["playback", "currently_playing"].includes(action.action)) {
    const playback = result.playback;
    return playback?.track
      ? `${playback.playing ? "Tocando" : "Pausada"}: ${playback.track.name} — ${playback.track.artist}.`
      : "Nenhuma música disponível agora. Abra o Spotify e inicie uma reprodução.";
  }
  return (
    (
      {
        pause: "Reprodução pausada no Spotify.",
        resume: "Reprodução retomada no Spotify.",
        next: "Comando de próxima música confirmado pelo Spotify.",
        previous: "Comando de música anterior confirmado pelo Spotify.",
        volume: "Volume ajustado no Spotify.",
        volume_delta: "Volume ajustado no Spotify.",
        transfer: "Dispositivo selecionado no Spotify.",
        test: "Conexão Spotify confirmada.",
      } as Record<string, string>
    )[action.action] || "Comando confirmado pelo Spotify."
  );
}
