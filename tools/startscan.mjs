#!/usr/bin/env node
/** startscan.mjs — what stands near the start (the author: «у спавна получеловек в земле»). node tools/startscan.mjs [--mode creative|survival] [--r 15] [--shot out.png] [--check] */
import { startServer, launch, openPage } from '../tests/e2e/harness.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const MODE = opt('mode', 'creative'), R = Number(opt('r', 15)), SHOT = opt('shot', null), CHECK = args.includes('--check');
const srv = await startServer(Number(opt('port', 8311)));
const browser = await launch({});
const { page } = await openPage(browser, srv.url, { noCamera: true });
await page.waitForFunction(() => document.querySelector('.mode-card[data-mode]'));
if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
await page.click(`.mode-card[data-mode="${MODE}"]`);
await page.evaluate((REAL) => { for (const [id, v] of [['hero-model', REAL ? 'real' : 'std'], ['graphics-quality', '0'], ['view-distance', 'low'], ['villager-ai', 'off'], ['villager-voice', '0']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } } }, args.includes('--real'));
await page.click('#start-btn');
await page.waitForFunction(() => window.__zns?.game?.active && window.__zns.game.revealed && !window.__zns.game.heroApply.pending, null, { timeout: 240000 });
await page.waitForTimeout(4000);
const found = await page.evaluate((R) => {
    const g = window.__zns.game, hp = g.character.group.position, out = [];
    const v = new g.camera.position.constructor();
    g.scene.updateMatrixWorld(true);
    // the scene's top things (not the terrain/trees/flora): where, how many meshes/bones, visible
    for (const c of g.scene.children) {
        c.getWorldPosition(v);
        let n = 0, sk = 0, bones = 0; c.traverse((o) => { if (o.isMesh) n++; if (o.isSkinnedMesh) { sk++; bones = Math.max(bones, o.skeleton.bones.length); } });
        let box = null; try { box = new g.camera.position.constructor(); } catch (e) { /* */ }
        const d = Math.hypot(v.x - hp.x, v.z - hp.z);
        if (c === g.character.group) continue;
        if (d > R && !(c.children.length && c.children.some((k) => { k.getWorldPosition(v); return Math.hypot(v.x - hp.x, v.z - hp.z) <= R; }))) continue;
        out.push({ root: c.name || c.type, ud: Object.keys(c.userData || {}).slice(0, 4).join(','), pos: [c.position.x, c.position.y, c.position.z].map((x) => +x.toFixed(1)), meshes: n, skinned: sk, bones, vis: c.visible, kids: c.children.length });
    }
    return { hero: [hp.x, hp.y, hp.z].map((x) => +x.toFixed(1)), out };
}, R);
console.log('hero', found.hero);
console.log(JSON.stringify(await page.evaluate(() => {
    const g = window.__zns.game, hp = g.character.group.position, res = [], seen = new Set();
    const chk = (path, o) => { const gr = o?.group || (o?.isObject3D ? o : null); if (!gr?.position || seen.has(gr)) return; seen.add(gr); const d = Math.hypot(gr.position.x - hp.x, gr.position.z - hp.z); if (d < 16) res.push(path + ' ' + (o.constructor?.name) + ' ' + [gr.position.x, gr.position.y, gr.position.z].map((x) => +x.toFixed(1)).join('/') + ' vis=' + gr.visible); };
    for (const k of Object.keys(g)) { const v = g[k]; if (!v || typeof v !== 'object') continue; if (v === g.scene || v === g.camera) continue; if (Array.isArray(v)) v.slice(0, 200).forEach((o, i) => chk(k + '[' + i + ']', o)); else if (v instanceof Map) [...v.values()].slice(0, 200).forEach((o, i) => chk(k + '{' + i + '}', o)); else if (v.group || v.model) chk(k, v); else for (const k2 of ['list', 'items', 'bodies', 'all', 'people', 'villagers', 'avatars', 'crew']) { const a = v[k2]; if (Array.isArray(a)) a.slice(0, 200).forEach((o, i) => chk(k + '.' + k2 + '[' + i + ']', o)); else if (a instanceof Map) [...a.values()].slice(0, 200).forEach((o, i) => chk(k + '.' + k2 + '{' + i + '}', o)); } }
    return res;
})));
console.log(JSON.stringify(await page.evaluate(() => {
    const g = window.__zns.game, hp = g.character.group.position, v = new g.camera.position.constructor(), by = new Map();
    g.scene.updateMatrixWorld(true);
    g.scene.children.forEach((top, i) => { if (top === g.character.group || top === g.camera) return; top.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || !o.visible) return; for (let p = o; p; p = p.parent) if (!p.visible) return; o.getWorldPosition(v); const d = Math.hypot(v.x - hp.x, v.z - hp.z); if (d > 4.5 || (o.geometry.attributes.position?.count || 0) > 300) return; const e = by.get(i) || { top: top.name || top.type, ud: Object.keys(top.userData).join(','), n: 0, ex: [] }; e.n++; if (e.ex.length < 3) e.ex.push([v.x, v.y, v.z].map((x) => +x.toFixed(1)).join('/') + ' ' + (o.name || o.type) + (o.isSkinnedMesh ? ' SK' : '')); by.set(i, e); }); });
    return [...by.values()];
})));
console.log('zombies', JSON.stringify(await page.evaluate(() => window.__zns.game.zombies.map((z) => ({ id: z.id, dummy: !!z.dummy, dead: !!z.isDead, x: +z.group.position.x.toFixed(1), y: +z.group.position.y.toFixed(1), z: +z.group.position.z.toFixed(1), gOff: z.gOff, ground: window.__zns.game.collision.groundY(z.group.position.x, z.group.position.z) }))))); 
const rows = found.out.filter((r) => r.vis && (r.skinned || r.meshes >= 3) && !['terrain','trees','magicFlora'].includes(r.root));
for (const r of rows) console.log(JSON.stringify(r));
console.log('top things', found.out.length, 'listed', rows.length);
if (SHOT) await page.screenshot({ path: SHOT });
await browser.close(); srv.stop();
