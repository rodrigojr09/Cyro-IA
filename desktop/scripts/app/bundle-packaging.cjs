// All renderer libraries are already compiled by build.cjs. Native runtime must
// remain limited to Electron, Node builtins and the explicitly audited manifest.
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');
module.exports = async function beforeBuild({ appDir }) {
  const defaults=JSON.parse(fs.readFileSync(path.join(appDir,'electron/backend-config.json'),'utf8'));
  const api=new URL(process.env.CYRO_BACKEND_ORIGIN || process.env.JARVIS_CLOUD_ORIGIN || defaults.origin);
  if(api.protocol!=='https:'||api.username||api.password||api.pathname!=='/'||api.search||api.hash)
    throw Error('Configure uma origem HTTPS válida da API para empacotar o Desktop.');
  // Never reuse an ignored configuration left by a previous Cloud-based build.
  fs.writeFileSync(path.join(appDir,'electron/cloud-config.json'),JSON.stringify({origin:api.origin}));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(appDir, 'electron/runtime-files.json'), 'utf8'),
  );
  for (const name of manifest)
    if (!fs.existsSync(path.join(appDir, name))) throw Error('Runtime file missing: ' + name);
  const native = manifest.filter(
    (name) =>
      (name.startsWith('scripts/') || name === 'electron/main.cjs') && /\.(js|cjs)$/.test(name),
  );
  const graph = require('esbuild').buildSync({
    absWorkingDir: appDir,
    entryPoints: native,
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    outdir: 'bundle-check',
    external: ['electron', ...builtinModules, ...builtinModules.map((name) => 'node:' + name)],
    logLevel: 'silent',
  });
  for (const name of Object.keys(graph.metafile.inputs)) {
    const relative = path.relative(appDir, path.resolve(appDir, name)).split(path.sep).join('/');
    if (!native.includes(relative))
      throw Error('Unexpected native runtime dependency: ' + relative);
  }
  // Supported electron-builder contract: dependencies are handled externally.
  // Returning false also avoids its unnecessary workspace dependency hoister.
  return false;
};
