// Owns only the test processes it launches; never attaches to a personal profile.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const desktop = path.join(root, "desktop");
const SMOKES = Object.freeze([
  "smoke.cjs",
  "quick-smoke.cjs",
  "cloud-smoke.cjs",
  "session-smoke.cjs",
  "clipboard-smoke.cjs",
  "writer-smoke.cjs",
  "spotify-smoke.cjs",
]);
function selectedSmokes(args) {
  if (args.length === 1 && args[0] === "--all") return SMOKES;
  if (args.length === 1 && SMOKES.includes(args[0])) return args;
  throw Error("Escolha um smoke registrado ou --all.");
}
function smokeEnvironment(source) {
  const environment = { ...source };
  // Electron launched inside an Electron host must still start as a GUI runtime.
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}
function main(args = process.argv.slice(2)) {
  const smokes = selectedSmokes(args);
  const electron = createRequire(path.join(desktop, "package.json"))(
    "electron",
  );
  for (const smoke of smokes) {
    process.stdout.write(`\nElectron: ${smoke}\n`);
    const result = spawnSync(electron, [smoke], {
      cwd: desktop,
      env: smokeEnvironment(process.env),
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status || 1;
  }
  return 0;
}
module.exports = { SMOKES, selectedSmokes, smokeEnvironment };
if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
