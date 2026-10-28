// Resolve from the outer executable, never Electron's temporary extraction directory.
const path = require('node:path');
const fs = require('node:fs');

function resolveData({ packaged, executable, override, localAppData, home }) {
  if (override) {
    if (!path.isAbsolute(override)) throw Error('JARVIS_DATA_DIR deve ser um caminho absoluto.');
    return path.resolve(override);
  }
  if (!packaged) return path.join(localAppData || path.join(home, 'AppData', 'Local'), 'JARVIS');
  const directory = path.dirname(path.resolve(executable));
  const root =
    path.basename(directory).toLowerCase() === 'app'
      ? path.dirname(directory)
      : path.join(directory, 'JARVIS');
  return path.join(root, 'data');
}

function configureElectron(app, dataDir) {
  // Must run before requestSingleInstanceLock and before app.ready.
  for (const [name, relative] of Object.entries({
    userData: 'config/electron',
    sessionData: 'cache/chromium',
    logs: 'logs',
    crashDumps: 'cache/crashes',
  })) {
    const target = path.join(dataDir, relative);
    let current = target;
    while (true) {
      if (
        fs.existsSync(current) &&
        fs.realpathSync(current).toLowerCase() !== current.toLowerCase()
      )
        throw Error('Pasta de dados redirecionada.');
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    fs.mkdirSync(target, { recursive: true });
    app.setPath(name, target);
  }
}
module.exports = { resolveData, configureElectron };
