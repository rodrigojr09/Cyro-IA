// Fixed application configuration only; the renderer never supplies a path or reads the key.
const fs = require('node:fs/promises');
const path = require('node:path');

function configPath({ packaged, dataDir, sourceDir }) {
  return path.join(packaged ? dataDir : path.join(sourceDir, '..', 'backend'), '.env');
}

async function prepareConfig(options) {
  const file = path.resolve(configPath(options));
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  const real = await fs.realpath(directory);
  if (real.toLowerCase() !== directory.toLowerCase())
    throw Error('Pasta de configuração redirecionada.');
  try {
    await fs.writeFile(
      file,
      '# Configuração privada do JARVIS. Nunca compartilhe este arquivo.\nOPENAI_API_KEY=\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw Error('Arquivo de configuração redirecionado ou compartilhado.');
  return file;
}

module.exports = { configPath, prepareConfig };
