// The app launcher's logic is Python (launcher/zns_launcher.py): run its unit tests here too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

test('launcher (Python): versions, install folder, self-update, shortcut, logs', { skip: !py && 'no Python' }, () => {
    const r = spawnSync(py, ['-m', 'unittest', 'discover', '-s', 'tests/python', '-p', 'test_*.py'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
});
