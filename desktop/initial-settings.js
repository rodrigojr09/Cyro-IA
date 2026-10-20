const fs = require('node:fs');
const path = require('node:path');

function load(dataDir, storage = null) {
  try {
    const file = path.join(dataDir, 'config/settings.json');
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) return {};
    const value = storage ? storage.readJSON(file) : JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      displayName:
        typeof value.display_name === 'string' ? value.display_name.slice(0, 120) : 'Usuário',
      theme: value.theme === 'light' ? 'light' : 'dark',
      voice: value.voice === true,
      quickChat: value.quick_chat !== false,
    };
  } catch {
    return {};
  }
}
module.exports = { load };
