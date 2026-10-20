const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function load(file, displays = [], storage = null) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) return null;
    const value = storage ? storage.readJSON(file) : JSON.parse(fs.readFileSync(file, 'utf8'));
    const b = value.bounds;
    if (
      !b ||
      !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(b[key])) ||
      b.width < 800 ||
      b.height < 560 ||
      b.width > 10000 ||
      b.height > 10000
    )
      return null;
    if (
      displays.length &&
      !displays.some(
        ({ workArea: a }) =>
          b.x + b.width > a.x + 80 &&
          b.x < a.x + a.width - 80 &&
          b.y + b.height > a.y + 80 &&
          b.y < a.y + a.height - 80,
      )
    )
      return null;
    return {
      bounds: b,
      maximized: value.maximized === true,
      fullscreen: value.fullscreen === true,
    };
  } catch {
    return null;
  }
}
function save(file, win, storage = null) {
  const state = {
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  };
  const temporary = file + '.' + randomUUID() + '.tmp';
  if (storage) {
    storage.writeJSON(file, state);
    return;
  }
  let created = false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(state), { flag: 'wx' });
    created = true;
    fs.renameSync(temporary, file);
    created = false;
  } catch {
    /* A janela continua utilizável se não for possível gravar preferências. */
  } finally {
    if (created) {
      try {
        fs.unlinkSync(temporary);
      } catch {}
    }
  }
}
module.exports = { load, save };
