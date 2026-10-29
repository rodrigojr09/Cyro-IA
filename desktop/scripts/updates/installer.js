const fs = require('node:fs');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { validatePE, semver, validSize } = require('./protocol');
async function inspect(file, version) {
  const stat = await fs.promises.stat(file);
  if (!validSize(stat.size)) throw Error('Tamanho de instalador inválido.');
  const handle = await fs.promises.open(file, 'r');
  let bytes;
  try {
    bytes = Buffer.alloc(Math.min(stat.size, 2 * 1024 * 1024));
    await handle.read(bytes, 0, bytes.length, 0);
  } finally {
    await handle.close();
  }
  validatePE(bytes);
  if (!bytes.includes(Buffer.from('NullsoftInst')))
    throw Error('O arquivo não é um instalador NSIS reconhecido.');
  const parsed = semver(version);
  if (!parsed) throw Error('Versão inválida.');
  // VS_FIXEDFILEINFO lives in the executable resource section, not in its payload.
  const pe = bytes.readUInt32LE(60),
    sections = bytes.readUInt16LE(pe + 6),
    table = pe + 24 + bytes.readUInt16LE(pe + 20);
  let resources;
  for (let i = 0; i < sections; i++) {
    const at = table + i * 40;
    if (at + 40 > bytes.length) throw Error('Seções PE inválidas.');
    if (bytes.toString('ascii', at, at + 5) === '.rsrc') {
      const offset = bytes.readUInt32LE(at + 20),
        length = bytes.readUInt32LE(at + 16);
      if (offset + length > bytes.length) throw Error('Recursos PE fora do limite.');
      resources = bytes.subarray(offset, offset + length);
    }
  }
  if (!resources) throw Error('Metadados de versão ausentes.');
  const marker = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);
  let found = false;
  for (let at = resources.indexOf(marker); at >= 0; at = resources.indexOf(marker, at + 4)) {
    if (at + 24 > resources.length) continue;
    const ms = resources.readUInt32LE(at + 16),
      ls = resources.readUInt32LE(at + 20);
    const actual = [ms >>> 16, ms & 0xffff, ls >>> 16];
    if (actual.join('.') !== parsed.numbers.join('.'))
      throw Error('O ProductVersion do instalador difere da tag selecionada.');
    found = true;
  }
  if (!found) throw Error('ProductVersion não verificável.');
  return { size: stat.size };
}
async function receive(source, file, size, onProgress = () => {}) {
  if (!validSize(size)) throw Error('Tamanho inválido.');
  let length = 0;
  const hash = crypto.createHash('sha256');
  const counter = new Transform({
    transform(chunk, _encoding, done) {
      length += chunk.length;
      if (length > size) {
        done(Error('Download excedeu o tamanho anunciado.'));
        return;
      }
      hash.update(chunk);
      onProgress(length, size);
      done(null, chunk);
    },
  });
  const handle = await fs.promises.open(file, 'wx', 0o600);
  try {
    await pipeline(source, counter, handle.createWriteStream());
    if (length !== size) throw Error('Transferência incompleta.');
    return hash.digest('hex');
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.promises.rm(file, { force: true });
    throw error;
  }
}
module.exports = { inspect, receive };
