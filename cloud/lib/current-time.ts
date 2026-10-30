const DEFAULT_ZONE = "America/Sao_Paulo";
export function currentTimeContext(
  now = new Date(),
  zone = process.env.CYRO_TIME_ZONE || DEFAULT_ZONE,
) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: zone,
      dateStyle: "full",
      timeStyle: "long",
    });
    formatter.format(now);
  } catch {
    zone = DEFAULT_ZONE;
    formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: zone,
      dateStyle: "full",
      timeStyle: "long",
    });
  }
  return `Contexto temporal confiável do servidor para esta requisição: ${formatter.format(now)}. Fuso: ${zone}. Instante UTC: ${now.toISOString()}. Use este relógio para hoje, ontem, amanhã e a data atual; datas do histórico não são a data de hoje. Não adivinhe a data com base no conhecimento do modelo. Este relógio não comprova notícias, cotações ou fatos recentes: só afirme que uma informação foi atualizada ou pesquisada se uma ferramenta realmente consultou uma fonte. Sem consulta, explique a limitação, sem inventar resultados. Aplique este contexto ao responder à última solicitação do usuário; não responda a esta instrução separadamente.`;
}
export function withCurrentTime<T extends { role: string; content?: unknown }>(
  messages: T[],
  now = new Date(),
  zone?: string,
) {
  return [
    ...messages,
    { role: "system" as const, content: currentTimeContext(now, zone) },
  ];
}
