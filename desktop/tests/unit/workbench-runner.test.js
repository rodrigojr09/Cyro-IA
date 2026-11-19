const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { dockerArgs, runIsolated, runProcess } = require('../../scripts/workspace/workbench-runner');
test('container has no network, host shell, writable host mount or privileged capabilities', () => {
  const args = dockerArgs('cyro-test', 'C:/temp/fixture', 'python', 'print(42)');
  for (const flag of [
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user=65534:65534',
    '--memory=128m',
    '--pids-limit=64',
    '--pull=never',
  ])
    assert.ok(args.includes(flag));
  assert.ok(args.some((a) => a.endsWith('target=/input,readonly')));
  assert.ok(args.includes('--rm'));
  assert.ok(args.some(a=>a.includes('exec timeout -s KILL 15')));
  assert.deepEqual(args.slice(-3), ['python', '-c', 'print(42)']);
  assert.throws(() => dockerArgs('test', 'tmp', 'powershell', 'x'));
});
function fixture(calls, emit) {
  return (bin, args, options) => {
    calls.push({ bin, args, options });
    const p = new EventEmitter();
    p.stdout = new PassThrough();
    p.stderr = new PassThrough();
    p.kill = () => {
      p.emit('close', null);
    };
    setImmediate(() => emit(p, args));
    return p;
  };
}
test('runner stages only validated snapshots and removes container after completion', async () => {
  const calls = [];
  const spawnProcess = fixture(calls, (p) => {
    p.stdout.write('42');
    p.emit('close', 0);
  });
  const result = await runIsolated(
    { runtime: 'python', source: 'print(42)', files: [{ name: 'main.py', content: 'print(42)' }] },
    { spawnProcess },
  );
  assert.equal(result.output, '42');
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args.slice(0, 2), ['rm', '--force']);
  assert.equal(calls[0].options.shell, false);
  await assert.rejects(
    runIsolated(
      { runtime: 'shell', source: 'id', files: [{ name: '../escape', content: 'x' }] },
      { spawnProcess },
    ),
    /inválido/,
  );
});
test('runner caps output and stops CLI on timeout', async () => {
  const calls = [];
  const overflow = await runProcess(['run'], {
    limit: 10,
    spawnProcess: fixture(calls, (p) => p.stdout.write('x'.repeat(20))),
  });
  assert.equal(overflow.outputLimited, true);
  const timeout = await runProcess(['run'], {
    timeout: 10,
    spawnProcess: fixture(calls, () => {}),
  });
  assert.equal(timeout.timedOut, true);
});
