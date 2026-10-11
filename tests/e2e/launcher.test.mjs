/**
 * The app launcher (launcher/zns_launcher.py): its loading screen in a browser window,
 * the first-launch folder choice, the download from «GitHub» (a local fake here),
 * the window turning into the game on the same address, quitting when the window
 * is closed; and the game's settings → «Журнал».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ROOT, startServer, launch, openPage, realErrors } from './harness.mjs';

const PY = 'python3';
const BASE = Number(process.env.ZNS_TEST_PORT) || 8240;
const SHA = 'b'.repeat(40);

/** A small «game» archive like GitHub's: the real server and launcher, a tiny page. */
function makeZip(dir) {
    const zip = path.join(dir, 'game.zip');
    execFileSync(PY, ['-c', `
import zipfile, sys
root, out = sys.argv[1], sys.argv[2]
files = ['server.py', 'pose_native.py', 'launcher/zns_launcher.py', 'launcher/launcher.pyw',
         'launcher/loading.html', 'assets/logo/logo.ico', 'assets/logo/logo-256.png']
with zipfile.ZipFile(out, 'w') as z:
    for f in files:
        z.write(root + '/' + f, 'working-hand-main-fbxy0j/' + f)
    z.writestr('working-hand-main-fbxy0j/index.html',
               '<!doctype html><meta charset="utf-8"><title>GAME</title><script>new EventSource("/api/alive")</script>')
`, ROOT, zip]);
    return fs.readFileSync(zip);
}

function fakeGithub(zip) {
    const hits = { zip: 0, refs: 0 };
    const srv = http.createServer((req, res) => {
        if (req.url.startsWith('/refs')) {
            hits.refs++;
            res.end(`001e# service=git-upload-pack\n0000003f${SHA} refs/heads/main-fbxy0j\n`);
        } else if (req.url.startsWith('/game.zip')) {
            hits.zip++;
            // (no Content-Length, as GitHub's archives: the screen shows «~N МБ»)
            res.writeHead(200, { 'Content-Type': 'application/zip' });
            res.end(zip);
        } else { res.statusCode = 404; res.end(); }
    });
    return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, hits, port: srv.address().port })));
}

function startLauncher(home, port, gh, install, extra = {}) {
    const proc = spawn(PY, [path.join(ROOT, 'launcher', 'launcher.pyw')], {
        env: {
            ...process.env, ZNS_LAUNCHER_HOME: home, ZNS_PORT: String(port), ZNS_LAUNCHER_NO_WINDOW: '1',
            ZNS_UPDATE_ZIP: `http://127.0.0.1:${gh.port}/game.zip`, ZNS_UPDATE_REFS: `http://127.0.0.1:${gh.port}/refs`,
            ZNS_UPDATE_API: 'http://127.0.0.1:9/none', ZNS_NO_PIP: '1', ZNS_DEFAULT_INSTALL: install, ZNS_LAUNCHER_GRACE: '1.5',
            ...extra,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { out += d; });
    const exited = new Promise((r) => proc.on('exit', (code) => r(code)));
    return { proc, exited, out: () => out };
}

async function waitUp(url) {
    for (let i = 0; i < 100; i++) {
        try { if ((await fetch(url)).ok) return; } catch (e) { /* not yet */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('launcher did not start');
}

test('launcher: first launch asks for the folder, downloads with a progress screen, opens the game, quits with the window; then opens at once', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zns-launcher-'));
    const home = path.join(tmp, 'home');
    const install = path.join(tmp, 'Игры');
    fs.mkdirSync(install);
    fs.writeFileSync(path.join(install, 'другое.txt'), 'not the game');
    const gh = await fakeGithub(makeZip(tmp));
    const browser = await launch({});
    try {
        // ---- the first launch
        const port = BASE;
        const L = startLauncher(home, port, gh, install);
        await waitUp(`http://127.0.0.1:${port}/__launcher/ping`);
        const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://localhost:${port}/`);
        await page.waitForSelector('#folder:not([hidden])');
        assert.equal(await page.locator('h1').textContent(), 'Волшебство только начинается');
        assert.equal(await page.inputValue('#folder-path'), install, 'the suggested folder is filled in');
        // a folder that can't be written to: a clear message, still on the folder screen
        await page.fill('#folder-path', '/proc/zns-nope');
        await page.click('#install');
        await page.waitForFunction(() => document.getElementById('folder-err').textContent.includes('нельзя'));
        // the real choice: a folder with other things in it → the game goes into «Volshebstvo» inside
        await page.fill('#folder-path', install);
        await page.click('#install');
        await page.waitForFunction(() => document.title === 'GAME', null, { timeout: 30000 });
        const game = path.join(install, 'Volshebstvo');
        assert.ok(fs.existsSync(path.join(game, 'server.py')), 'the game is installed in the chosen folder');
        assert.equal(fs.readFileSync(path.join(game, '.zns-version'), 'ascii').trim(), SHA);
        assert.ok(fs.existsSync(path.join(install, 'другое.txt')), 'the person\'s own files stay');
        assert.ok(fs.existsSync(path.join(home, 'launcher', 'launcher.pyw')), 'the launcher copied itself into its own folder');
        assert.ok(fs.existsSync(path.join(home, 'launcher', 'logo.ico')), 'the logo for the shortcut');
        assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')).install_dir, game);
        assert.equal(gh.hits.zip, 1);
        // the game's server now answers on the same address, with the logs for the settings
        const logs = await (await fetch(`http://127.0.0.1:${port}/api/logs`)).json();
        assert.ok(logs.launcher);
        assert.match(logs.logs[0].text, /Игра запущена/);
        assert.deepEqual(errors, []);
        // the window is closed → the launcher quits by itself
        await page.close();
        const code = await Promise.race([L.exited, new Promise((r) => setTimeout(() => r('still running'), 15000))]);
        assert.equal(code, 0, 'launcher quit after the window closed: ' + L.out());

        // ---- the next launch: no questions, nothing to download (same version), straight into the game
        const L2 = startLauncher(home, port + 1, gh, install);
        await waitUp(`http://127.0.0.1:${port + 1}/__launcher/ping`);
        const p2 = await browser.newPage();
        await p2.goto(`http://localhost:${port + 1}/`);
        await p2.waitForFunction(() => document.title === 'GAME', null, { timeout: 30000 });
        assert.equal(gh.hits.zip, 1, 'the same version is not downloaded again');
        // a second double-click while the game runs only opens another window
        const L3 = startLauncher(home, port + 1, gh, install);
        assert.equal(await Promise.race([L3.exited, new Promise((r) => setTimeout(() => r('still running'), 10000))]), 0);
        assert.match(L3.out(), /уже запущена/);
        await p2.close();
        assert.equal(await Promise.race([L2.exited, new Promise((r) => setTimeout(() => r('still running'), 15000))]), 0);
    } finally {
        await browser.close();
        gh.srv.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('launcher: no internet on the first launch → a friendly error and «Попробовать ещё раз»', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zns-launcher-'));
    const home = path.join(tmp, 'home');
    const gh = { port: 9 }; // nothing listens there
    const L = startLauncher(home, BASE + 5, gh, path.join(tmp, 'Game'));
    const browser = await launch({});
    try {
        await waitUp(`http://127.0.0.1:${BASE + 5}/__launcher/ping`);
        const page = await browser.newPage();
        await page.goto(`http://localhost:${BASE + 5}/`);
        await page.click('#install');
        await page.waitForSelector('#error:not([hidden])', { timeout: 30000 });
        assert.match(await page.locator('#error-text').textContent(), /интернет/);
        assert.ok(await page.locator('#retry').isVisible());
        await page.click('#show-log');
        await page.waitForFunction(() => document.getElementById('log').textContent.includes('Скачивание не удалось'));
        await page.close();
        assert.equal(await Promise.race([L.exited, new Promise((r) => setTimeout(() => r('still running'), 15000))]), 0);
    } finally {
        L.proc.kill();
        await browser.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('launcher: while the game runs it gets the newer version at once (only the changed files), and a friend\'s older one', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zns-launcher-'));
    const home = path.join(tmp, 'home');
    const install = path.join(tmp, 'Game');
    const NEW = 'd'.repeat(40);
    const page = (title) => `<!doctype html><meta charset="utf-8"><title>${title}</title>`;
    let latest = SHA;
    const zip = makeZip(tmp);
    const hits = { zip: 0, raw: [] };
    const diff = { status: 'ahead', files: [{ filename: 'index.html', status: 'modified' }] };
    const gh = http.createServer((req, res) => {
        const u = req.url;
        if (u.startsWith('/refs')) return res.end(`001e# service=git-upload-pack\n0000003f${latest} refs/heads/main-fbxy0j\n`);
        if (u.startsWith('/game.zip')) { hits.zip++; return res.end(zip); }
        if (u === `/compare/${SHA}...${NEW}`) return res.end(JSON.stringify(diff));
        if (u === `/compare/${NEW}...${SHA}`) return res.end(JSON.stringify({ status: 'behind', files: [] }));
        if (u === `/commit/${SHA.slice(0, 7)}`) return res.end(JSON.stringify({ sha: SHA }));
        if (u.startsWith('/raw/')) { hits.raw.push(u); return res.end(page(u.includes(NEW) ? 'GAME 2' : 'GAME')); }
        res.statusCode = 404; res.end();
    });
    await new Promise((r) => gh.listen(0, '127.0.0.1', r));
    const g = `http://127.0.0.1:${gh.address().port}`;
    const port = BASE + 9;
    const L = startLauncher(home, port, { port: gh.address().port }, install, { ZNS_UPDATE_COMPARE: `${g}/compare`, ZNS_UPDATE_RAW: `${g}/raw`, ZNS_UPDATE_COMMIT: `${g}/commit` });
    const api = (p, body) => fetch(`http://127.0.0.1:${port}${p}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}).then((r) => (p === '/' ? r.text() : r.json()));
    const until = async (fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout: ' + L.out()); await new Promise((r) => setTimeout(r, 150)); } };
    try {
        await waitUp(`http://127.0.0.1:${port}/__launcher/ping`);
        await api('/__launcher/folder', { path: install });
        await until(async () => (await api('/__launcher/status')).done);
        assert.match(await api('/'), /<title>GAME<\/title>/);
        // a newer version comes out while the menu is open: the menu asks, it is in place in a moment
        latest = NEW;
        assert.equal((await api('/api/update?fresh=1')).latest, NEW.slice(0, 7));
        assert.ok((await api('/__launcher/update', {})).ok);
        const done = await until(async () => { const s = await api('/__launcher/update'); return s.state === 'done' || s.state === 'fail' ? s : null; });
        assert.equal(done.state, 'done', JSON.stringify(done));
        assert.match(await api('/'), /GAME 2/, 'the page reloads into the new version');
        assert.equal((await api('/api/version')).full, NEW);
        assert.equal(hits.zip, 1, 'only the changed files were downloaded, not the whole game again');
        assert.deepEqual(hits.raw, [`/raw/${NEW}/index.html`]);
        // a friend's server runs the older version (it says only «bbbbbbb»): exactly that one comes back
        assert.ok((await api('/__launcher/update', { sha: SHA.slice(0, 7) })).ok);
        const back = await until(async () => { const s = await api('/__launcher/update'); return s.state === 'done' || s.state === 'fail' ? s : null; });
        assert.equal(back.state, 'done', JSON.stringify(back));
        assert.match(await api('/'), /<title>GAME<\/title>/);
        assert.equal(fs.readFileSync(path.join(install, '.zns-version'), 'ascii').trim(), SHA);
    } finally {
        L.proc.kill();
        gh.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('settings → «Журнал» shows what the game wrote', async () => {
    const srv = await startServer(BASE + 7);
    const browser = await launch({});
    try {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
        await page.click('.tab-btn[data-tab="tab-settings"]');
        await page.click('#tab-settings .sub-tab[data-sub="set-log"]');
        await page.waitForFunction(() => document.querySelectorAll('#log-file option').length > 0);
        const text = await page.locator('#log-text').textContent();
        assert.match(text, /сервер запущен/);
        assert.ok(await page.locator('#log-copy').isVisible());
        assert.deepEqual(realErrors(errors), []);
    } finally {
        await browser.close();
        srv.stop();
    }
});
