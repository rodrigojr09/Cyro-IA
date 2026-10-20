// Same AES-GCM envelope and relative-path AAD as Python protected_storage.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAGIC = Buffer.from('JARVIS-DATA\x01', 'binary');

function create(root, encodedKey) {
  root = path.resolve(root);
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw Error('Cofre bloqueado.');
  function target(file) {
    file = path.resolve(file);
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw Error('Destino inválido.');
    let current = file;
    while (current !== path.dirname(current)) {
      if (
        fs.existsSync(current) &&
        fs.realpathSync(current).toLowerCase() !== current.toLowerCase()
      )
        throw Error('Destino redirecionado.');
      current = path.dirname(current);
    }
    if (fs.existsSync(file) && fs.lstatSync(file).nlink !== 1)
      throw Error('Arquivo compartilhado.');
    return { file, aad: Buffer.concat([MAGIC, Buffer.from(relative.split(path.sep).join('/'))]) };
  }
  function readJSON(file) {
    const destination = target(file);
    if (!fs.existsSync(file)) return null;
    if (fs.statSync(file).size > 1024 * 1024) throw Error('Estado muito grande.');
    const content = fs.readFileSync(file);
    if (!content.subarray(0, MAGIC.length).equals(MAGIC))
      throw Error('Use a migração guiada para dados antigos.');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      content.subarray(MAGIC.length, MAGIC.length + 12),
    );
    decipher.setAAD(destination.aad);
    decipher.setAuthTag(content.subarray(-16));
    return JSON.parse(
      Buffer.concat([
        decipher.update(content.subarray(MAGIC.length + 12, -16)),
        decipher.final(),
      ]).toString('utf8'),
    );
  }
  function writeJSON(file, value) {
    const destination = target(file);
    const text = Buffer.from(JSON.stringify(value));
    if (text.length > 1024 * 1024) throw Error('Estado muito grande.');
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(destination.aad);
    const encrypted = Buffer.concat([
      MAGIC,
      nonce,
      cipher.update(text),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, encrypted);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return { readJSON, writeJSON };
}
module.exports = { create };
