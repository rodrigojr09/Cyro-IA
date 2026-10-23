const { createHash, randomUUID } = require('node:crypto');

// Keep below the existing 6,000-character message limit, including the action prompt.
const MAX_CHARS = 5400;
const MAX_BYTES = 21600;
const MAX_IMAGE_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 350 * 1024;
const MAX_IMAGE_PIXELS = 50_000_000;
const MAX_IMAGE_EDGE = 1536;
const TTL = 10 * 60 * 1000;
const defaults = Object.freeze({ enabled: false, paused: false, sound: true, volume: 0.25 });
function settings(value = {}) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(defaults, key))
  )
    throw Error('Configuração inválida.');
  const result = { ...defaults, ...value };
  if (
    ['enabled', 'paused', 'sound'].some((key) => typeof result[key] !== 'boolean') ||
    !Number.isFinite(result.volume) ||
    result.volume < 0 ||
    result.volume > 1
  )
    throw Error('Configuração inválida.');
  return result;
}
function safeURL(text) {
  try {
    if (/[\s\\\u0000-\u001f]/.test(text) || text.length > 2048) return null;
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
function sensitive(text) {
  let credentialURL = false;
  try {
    const url = new URL(text);
    credentialURL =
      [...url.searchParams.keys()].some((key) =>
        /token|secret|password|signature|credential|authorization|(?:^|_)key$|^code$|^sig$/i.test(
          key,
        ),
      ) || /token|secret|password|authorization/i.test(url.hash);
  } catch {
    /* Not a URL. */
  }
  return (
    credentialURL ||
    /(?:-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:password|passwd|senha|secret|token|api[_ -]?key|authorization)\b["']?\s*[=:]\s*\S+|\b(?:senha|password)\s+(?:é|is)\s+\S+|\bBearer\s+\S+|\bsk-[\w-]{12,}|\bgh[pousr]_[\w]{16,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[\w-]+\.[\w-]+\.[\w-]+)/i.test(
      text,
    ) ||
    (!/\s/.test(text) && text.length >= 12 && !safeURL(text)) ||
    /\b[A-Za-z0-9_+/=-]{32,}\b/.test(text.replace(/https?:\/\/[^\s]+/g, ''))
  );
}
function classify(text) {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > MAX_CHARS ||
    Buffer.byteLength(text, 'utf8') > MAX_BYTES ||
    sensitive(text)
  )
    return null;
  text = text.trim();
  const url = safeURL(text);
  if (url) return { contentType: 'link', text, url };
  // Reject URL-like payloads with unsafe protocols or embedded credentials.
  if (/^[a-z][\w+.-]*:/i.test(text) && !/^(?:const|let|var)\b/.test(text)) return null;
  const code =
    /(?:```|\b(?:function|class|const|let|import|export)\s+\w+|\bdef\s+\w+\s*\(|\bSELECT\s+.+\bFROM\b|=>|#include\s*[<"])/i.test(
      text,
    );
  return { contentType: code ? 'code' : 'text', text };
}
function createClipboardManager({
  clipboard,
  changed = () => {},
  sound = () => {},
  now = Date.now,
  schedule = setInterval,
  cancel = clearInterval,
  config = defaults,
}) {
  let preferences = settings(config),
    pending = null,
    lastHash = null,
    timer = null,
    active = false,
    disposed = false,
    lastSound = -Infinity,
    masterSound = false;
  const claims = new Map();
  function publish() {
    changed(state());
  }
  function state() {
    return {
      pending: !!pending,
      notification: pending ? metadata(pending) : null,
      settings: { ...preferences },
      active,
      owned: Object.fromEntries([...claims].map(([owner, item]) => [owner, item.id])),
    };
  }
  function metadata(item) {
    const { id, contentType, contentReference, createdAt, status, claimedBy, acknowledgedAt } =
      item;
    return { id, contentType, contentReference, createdAt, status, claimedBy, acknowledgedAt };
  }
  function clear() {
    pending = null;
    claims.clear();
    lastHash = null;
    publish();
  }
  function read() {
    const formats = clipboard.availableFormats();
    if (formats.some((format) => /image|bitmap|dib|png|jpeg/i.test(format))) {
      const image = clipboard.readImage?.();
      if (!image || image.isEmpty()) return null;
      const size = image.getSize();
      if (
        !Number.isInteger(size.width) ||
        !Number.isInteger(size.height) ||
        size.width <= 0 ||
        size.height <= 0 ||
        size.width * size.height > MAX_IMAGE_PIXELS
      )
        return null;
      const original = image.toPNG();
      if (!original.length || original.length > MAX_IMAGE_SOURCE_BYTES) return null;
      const hash = createHash('sha256').update('image:').update(original).digest('hex');
      if (hash === lastHash) return { hash, content: null };
      const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(size.width, size.height));
      let width = Math.max(1, Math.round(size.width * ratio)),
        height = Math.max(1, Math.round(size.height * ratio));
      let preview = image.resize({ width, height, quality: 'good' }).toPNG();
      // Match existing attachment preview bounds without storing the original or using Cloud.
      for (let attempt = 0; preview.length > MAX_IMAGE_PREVIEW_BYTES && attempt < 20; attempt++) {
        width = Math.max(1, Math.floor(width * 0.8));
        height = Math.max(1, Math.floor(height * 0.8));
        preview = image.resize({ width, height, quality: 'good' }).toPNG();
      }
      if (!preview.length || preview.length > MAX_IMAGE_PREVIEW_BYTES) return null;
      return {
        hash,
        content: {
          contentType: 'image',
          imageData: 'data:image/png;base64,' + preview.toString('base64'),
          width,
          height,
        },
      };
    }
    const text = clipboard.readText();
    if (text.length > MAX_CHARS || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return null;
    return {
      hash: createHash('sha256').update('text:').update(text).digest('hex'),
      content: classify(text),
    };
  }
  function expire() {
    let dirty = false;
    if (pending && now() - pending.createdAt >= TTL) {
      pending = null;
      dirty = true;
    }
    for (const [owner, item] of claims)
      if (now() - item.createdAt >= TTL) {
        claims.delete(owner);
        dirty = true;
      }
    if (dirty) publish();
  }
  function tick(baseline = false) {
    if (disposed || !active || !preferences.enabled || preferences.paused) return;
    expire();
    try {
      const capture = read();
      const hash = capture?.hash ?? null;
      if (baseline || hash === lastHash) {
        lastHash = hash;
        return;
      }
      lastHash = hash;
      const content = capture?.content ?? null;
      // An invalid/latest copy must not leave an older pending copy available.
      pending = content
        ? {
            ...content,
            id: randomUUID(),
            contentReference: randomUUID(),
            createdAt: now(),
            status: 'PENDING',
            claimedBy: null,
            acknowledgedAt: null,
          }
        : null;
      publish();
      if (
        pending &&
        preferences.sound &&
        masterSound &&
        preferences.volume > 0 &&
        now() - lastSound >= 2000
      ) {
        lastSound = now();
        sound(preferences.volume);
      }
    } catch {
      /* Clipboard can temporarily be locked by another Windows application. */
    }
  }
  function restart() {
    if (timer !== null) cancel(timer);
    timer = null;
    if (!disposed && active && preferences.enabled && !preferences.paused) {
      tick(true);
      timer = schedule(() => tick(), 850);
      timer?.unref?.();
    }
  }
  return {
    state,
    tick,
    configure(value) {
      const next = settings({ ...preferences, ...value });
      const reset = preferences.enabled !== next.enabled || preferences.paused !== next.paused;
      preferences = next;
      if (reset) {
        clear();
        restart();
      }
      publish();
      return state();
    },
    setActive(value) {
      active = !!value;
      clear();
      restart();
    },
    setMasterSound(value) {
      masterSound = value === true;
    },
    claim(owner) {
      if (!['main', 'quick'].includes(owner)) throw Error('Ambiente inválido.');
      expire();
      if (claims.has(owner)) return { ok: false, reason: 'BUSY' };
      if (!pending) return { ok: false, reason: 'ALREADY_CLAIMED_OR_IDLE' };
      const item = pending;
      pending = null;
      item.status = owner === 'main' ? 'CLAIMED_MAIN' : 'CLAIMED_QUICK';
      item.claimedBy = owner;
      item.acknowledgedAt = now();
      claims.set(owner, item);
      publish();
      return { ok: true, notification: { ...item } };
    },
    dismiss(owner, id) {
      if (claims.get(owner)?.id !== id) return false;
      claims.delete(owner);
      publish();
      return true;
    },
    link(owner, id) {
      const item = claims.get(owner);
      return item?.id === id && item.contentType === 'link' ? safeURL(item.text) : null;
    },
    discardPending() {
      pending = null;
      publish();
    },
    destroy() {
      disposed = true;
      active = false;
      if (timer !== null) cancel(timer);
      timer = null;
      clear();
    },
  };
}
function overlay(nativeImage) {
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const distance = (x - 7.5) ** 2 + (y - 7.5) ** 2,
        i = (y * 16 + x) * 4;
      if (distance <= 49) {
        const border = distance > 30;
        pixels[i] = border ? 255 : 68;
        pixels[i + 1] = border ? 255 : 68;
        pixels[i + 2] = border ? 255 : 239;
        pixels[i + 3] = 255;
      }
    }
  return nativeImage.createFromBitmap(pixels, { width: 16, height: 16 });
}
// Local 160 ms PCM chime. No external resource, paid audio, or clipboard payload.
function chime() {
  const count = 7056,
    data = Buffer.alloc(44 + count * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(44100, 24);
  data.writeUInt32LE(88200, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    data.writeInt16LE(
      Math.round(
        9000 * Math.sin((2 * Math.PI * 880 * i) / 44100) * Math.sin((Math.PI * i) / count) ** 2,
      ),
      44 + i * 2,
    );
  return 'data:audio/wav;base64,' + data.toString('base64');
}
module.exports = {
  createClipboardManager,
  classify,
  sensitive,
  safeURL,
  settings,
  defaults,
  overlay,
  chime,
  MAX_CHARS,
  MAX_BYTES,
  MAX_IMAGE_SOURCE_BYTES,
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_EDGE,
  TTL,
};
