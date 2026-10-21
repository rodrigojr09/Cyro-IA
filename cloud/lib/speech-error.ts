import OpenAI from "openai";
import { HttpError } from "./http";

export function speechError(error: unknown): HttpError {
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new HttpError(
      504,
      "A síntese de voz demorou demais. Tente novamente.",
    );
  if (error instanceof OpenAI.APIError) {
    if (
      error.status === 401 ||
      error.status === 403 ||
      error.status === 400 ||
      error.status === 404
    )
      return new HttpError(
        502,
        "Configuração de voz recusada pela OpenAI. Contate o administrador.",
      );
    if (error.status === 429)
      return new HttpError(
        503,
        "Limite ou saldo da OpenAI indisponível para voz. Contate o administrador.",
      );
  }
  return new HttpError(502, "Síntese de voz indisponível.");
}
