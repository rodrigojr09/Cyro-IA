async function consume(response, onDelta) {
  if (!response.ok) {
    try {
      const data = await response.json();
      if (typeof data.detail === 'string')
        return { ok: false, data: { detail: data.detail.slice(0, 512) } };
    } catch {}
    return { ok: false, data: { detail: 'Conexão local indisponível.' } };
  }
  if (!response.body) return { ok: false, data: { detail: 'Conexão local indisponível.' } };
  const decoder = new TextDecoder();
  let buffer = '',
    result;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 1024 * 1024) throw Error('Resposta excessiva.');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!event.startsWith('data: ')) continue;
      const value = JSON.parse(event.slice(6));
      if (typeof value.delta === 'string') onDelta(value.delta);
      if (value.result) result = { ok: true, data: value.result };
      if (value.error) throw Error(String(value.error));
    }
  }
  if (!result) throw Error('Resposta interrompida.');
  return result;
}
module.exports = { consume };
