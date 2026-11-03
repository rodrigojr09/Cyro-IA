const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  selectedSmokes,
  smokeEnvironment,
  SMOKES,
} = require("./run_electron_smoke.cjs");
test("smoke runner selects only registered entry points, including Writer and Spotify", () => {
  assert.deepEqual(selectedSmokes(["--all"]), SMOKES);
  assert.ok(
    SMOKES.includes("writer-smoke.cjs") && SMOKES.includes("spotify-smoke.cjs"),
  );
  assert.deepEqual(selectedSmokes(["clipboard-smoke.cjs"]), [
    "clipboard-smoke.cjs",
  ]);
  for (const args of [[], ["../main.js"], ["--eval"], ["smoke.cjs", "--all"]])
    assert.throws(() => selectedSmokes(args));
});
test("smoke runner clears Electron host flag without changing parent environment", () => {
  const source = {
    ELECTRON_RUN_AS_NODE: "1",
    PATH: "fixture",
    JARVIS_CLOUD_ORIGIN: "https://example.test",
    CYRO_BACKEND_ORIGIN: "https://api.example.test",
  };
  const result = smokeEnvironment(source);
  assert.equal(result.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(result.JARVIS_CLOUD_ORIGIN, undefined);
  assert.equal(result.CYRO_BACKEND_ORIGIN, undefined);
  assert.equal(source.CYRO_BACKEND_ORIGIN, "https://api.example.test");
  assert.equal(source.ELECTRON_RUN_AS_NODE, "1");
});
