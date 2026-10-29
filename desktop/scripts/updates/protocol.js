// Shared wire rules: Cloud imports this module; Electron ships the same source.
const MAX_SETUP = 1024 * 1024 * 1024;
function semver(value) {
  if (typeof value !== 'string' || value.length > 100) return null;
  const m =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/.exec(
      value,
    );
  if (!m || m.slice(1, 4).some((x) => !Number.isSafeInteger(Number(x)))) return null;
  const pre = m[4] ? m[4].split('.') : [];
  if (
    pre.some(
      (x) =>
        /^\d+$/.test(x) && ((x.length > 1 && x[0] === '0') || !Number.isSafeInteger(Number(x))),
    )
  )
    return null;
  return { numbers: m.slice(1, 4).map(Number), pre, version: value };
}
function compare(a, b) {
  const x = semver(a),
    y = semver(b);
  if (!x || !y) throw Error('Versão inválida.');
  for (let i = 0; i < 3; i++)
    if (x.numbers[i] !== y.numbers[i]) return Math.sign(x.numbers[i] - y.numbers[i]);
  if (!x.pre.length || !y.pre.length)
    return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i],
      q = y.pre[i];
    if (p === q) continue;
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    const pn = /^\d+$/.test(p),
      qn = /^\d+$/.test(q);
    if (pn && qn) return Math.sign(Number(p) - Number(q));
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
function tagVersion(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v') || !semver(tag.slice(1)))
    throw Error('Selecione uma tag SemVer existente (vX.Y.Z).');
  return tag.slice(1);
}
function validSize(size) {
  return Number.isSafeInteger(size) && size >= 65536 && size <= MAX_SETUP;
}
function officialSetup(url, tag) {
  return (
    url ===
    'https://github.com/rodrigojr09/Cyro-IA/releases/download/' +
      encodeURIComponent(tag) +
      '/Setup.exe'
  );
}
// Validate the PE envelope and NSIS signature. ProductVersion is verified by the
// Windows publisher/updater, not inferred from an arbitrary original filename.
function validatePE(bytes) {
  if (bytes.length < 1024 || bytes.toString('ascii', 0, 2) !== 'MZ')
    throw Error('Instalador Windows inválido.');
  const offset = bytes.readUInt32LE(60);
  if (
    offset < 64 ||
    offset + 26 > bytes.length ||
    bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0' ||
    bytes.readUInt16LE(offset + 22) & 0x2000
  )
    throw Error('Formato PE inválido.');
  if (![0x14c, 0x8664].includes(bytes.readUInt16LE(offset + 4)))
    throw Error('Arquitetura Windows não suportada.');
}
module.exports = { MAX_SETUP, semver, compare, tagVersion, validSize, officialSetup, validatePE };
