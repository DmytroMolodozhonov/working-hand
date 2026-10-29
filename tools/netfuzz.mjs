#!/usr/bin/env node
/**
 * netfuzz.mjs — every message type of the network protocol (NetSync._onMessage), malformed (missing fields, wrong types,
 * absurd numbers, unknown ids), handed straight to a running game — as the host or as a guest — one type at a time, timed.
 * Prints the ones that throw or take > 300 ms (a frozen game: the others drop it after 30 s). docs/qa/multiplayer-report.md.
 *   node tools/netfuzz.mjs [host|guest] [from-type]      (ZNS_CHROME=/path/to/chrome for another Chromium build)
 */
import fs from 'node:fs';
import { PeerServer } from 'peer';
import { startServer, launch } from '../tests/e2e/harness.mjs';
const srv = await startServer(8164);
const ps = PeerServer({ port: 9024, path: '/zns', host: '127.0.0.1' });
const b = await launch();
const page = await (await b.newContext({ viewport: { width: 560, height: 320 } })).newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().split('\n').slice(0, 3).join(' | ').slice(0, 300)); });
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_FIXED_QUALITY__ = true; window.__ZNS_NO_FULLSCREEN__ = true; });
await page.goto(srv.url); await page.waitForFunction(() => !!window.__zns);
await page.click('[data-tab="tab-mp"]'); await page.fill('#mp-name', 'H');
await page.click('#mp-advanced > summary'); await page.fill('#mp-server', '127.0.0.1:9024/zns');
await page.evaluate(() => { document.getElementById('mp-mode').value = 'creative'; });
await page.click('#mp-private-btn');
await page.waitForFunction(() => window.__zns?.game?.active, null, { timeout: 240000, polling: 1000 });
const src = fs.readFileSync(new URL('../src/net/NetSync.js', import.meta.url), 'utf8');
const types = [...new Set([...src.slice(src.indexOf('_onMessage(m) {')).matchAll(/case '(\w+)'/g)].map((m) => m[1]))].filter((t) => t !== 'win');
const role = process.argv[2] || 'host';
await page.evaluate(({ role }) => { const g = window.__zns.game, net = window.__zns.net; if (role === 'guest') { Object.defineProperty(net, 'isHost', { get: () => false, configurable: true }); g.authority = false; } g.sync._syncPlayerList([{ id: 'ghost', name: 'Призрак', color: 3 }]); }, { role }); // (the sender is a real player here: his avatar exists)
const res = [];
const from = process.argv[3]; let on = !from;
for (const t of types) {
  if (!on) { on = t === from; if (!on) continue; }
  process.stdout.write(t + ' ');
  if (page.isClosed()) { console.log('\nPAGE CLOSED before', t); break; }
  const r = await Promise.race([page.evaluate(({ t }) => {
    const g = window.__zns.game, sync = g.sync, to = window.__zns.net.localId;
    const junk = [{}, { id: 'nobody', by: 'ghost', to, l: 'x', p: 'x', s: 'x', d: 'x', o: 'x', m: null, k: 'x', a: 'x', e: 'x', c: 'x', f: 'x', w: 'x', i: -1, n: 1e9, x: 'a', z: 'b', b: 'x', r: 'x', h: 'x', v: 'x', q: 'x', item: 'x', uid: 'x', side: 'x', name: 5, text: {}, res: 'x' },
      { id: 1, by: 1, to, l: [null, 1, 'a', {}, [1, 2]], p: [1], s: [], d: [null], o: [null, null], c: [[1]], m: {}, k: 1, a: 'set', e: 'go', f: [{}], b: {}, r: [], h: [1], item: {}, uid: 1, w: [[1]], v: [], res: {}, name: 'Bombarda', text: 'x'.repeat(5000) },
      { id: 'z1', by: to, to, l: [[1, 2, 3]], p: [1e308, -1e308, 0], s: [0, 'sword', 1, 2, 3, 0, 0, 0, 1, 0, 0], d: [0, 0, 1], o: [0, 0, 0], k: 'z', a: 'got', e: 'boom', item: { kind: 'wand' }, side: 'left', res: { died: true }, name: 'Expelliarmus', n: 1e9, r: 1e9 }];
    const out = [];
    for (const [j, x] of junk.entries()) { const t0 = performance.now(); try { sync._onMessage({ t, from: 'ghost', ...x }); } catch (e) { out.push(`${t}#${j} THROW ${e.message.slice(0, 80)}`); } const dt = performance.now() - t0; if (dt > 300) out.push(`${t}#${j} ${Math.round(dt)} ms`); }
    return out;
  }, { t }), new Promise((r) => setTimeout(() => r([`${t} HANG > 20 s`]), 20000))]).catch((e) => [`${t} EVAL FAIL ${e.message.slice(0, 80)}`]);
  if (r.some((x) => /HANG/.test(x))) { res.push(...r); break; }
  { const t0 = Date.now(); const ok = await Promise.race([page.evaluate(() => new Promise((q) => requestAnimationFrame(() => q(1)))), new Promise((q) => setTimeout(() => q(0), 20000))]); if (!ok) { res.push(`${t}: no frame for 20 s after`); break; } if (Date.now() - t0 > 4000) res.push(`${t}: next frame ${Date.now() - t0} ms`); }
  res.push(...r);
  if (r.some((x) => /EVAL FAIL/.test(x))) break;
}
console.log('SLOW/THROW:', res);
const t0 = Date.now();
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))).catch(() => {});
console.log('next frame after', Date.now() - t0, 'ms');
console.log('ERRORS', [...new Set(errs)].slice(0, 40).join('\n'));
await b.close(); srv.stop(); ps.close?.(); process.exit(0);
