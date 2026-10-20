// Local compatibility adapter for the pinned packager; installed files stay untouched.
const {
  NodeModulesCollector,
} = require('app-builder-lib/out/node-module-collector/nodeModulesCollector');
const { parsePackageOutput } = require('./package-output');
const { build } = require('electron-builder');
const path = require('node:path');

NodeModulesCollector.prototype.parseDependenciesTree = parsePackageOutput;
// Balanced compression keeps repeatable local builds practical on modest Windows PCs.
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ??= '5';
build({
  config: path.join(__dirname, 'electron-builder.json'),
  targets: require('electron-builder').Platform.WINDOWS.createTarget(
    'portable',
    require('builder-util').Arch.x64,
  ),
  publish: 'never',
}).catch(() => {
  console.error('Não foi possível empacotar o JARVIS. Confira as mensagens do compilador acima.');
  process.exit(1);
});
