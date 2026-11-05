#!/usr/bin/env node
/** startfirst.mjs — what is drawn within R m of the hero in the FIRST frames after the loading screen opens (the author: «все текстуры персонажей накладываются у спавна, потом пропадают»). node tools/startfirst.mjs [--mode creative] [--r 15] [--frames 90] */
import { startServer, launch, openPage } from '../tests/e2e/harness.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const MODE = opt('mode', 'creative'), R = Number(opt('r', 15)), FR = Number(opt('frames', 90));
const srv = await startServer(Number(opt('port', 8330)));
const browser = await launch({});
const { page } = await openPage(browser, srv.url, { noCamera: true });
await page.evaluate(async ([R, FR]) => {
    window.__FB = await import('/src/core/FarBatch.js'); window.__ident = [];
    window.__first = { frames: [], armed: false };
    const t = setInterval(() => {
        const g = window.__zns?.game; if (!g?.renderer || g.__hooked) return;
        g.__hooked = true;
        const orig = g.renderer.render.bind(g.renderer);
        let n = 0;
        g.renderer.render = (scene, cam) => {
            if (g.revealed && n < FR && scene === g.scene) {
                n++;
                const hp = g.character.group.position, v = new cam.position.constructor(), m = new (cam.matrixWorld.constructor)(), found = {};
                scene.updateMatrixWorld(true);
                scene.traverse((o) => {
                    if (!(o.isMesh || o.isSprite || o.isPoints) || !o.visible) return;
                    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
                    if (o.isInstancedMesh && o.count === 0) return;
                    let root = o; while (root.parent && root.parent !== scene) root = root.parent;
                    if (root === g.character.group || root === g.terrain?.group) return;
                    const key = (root.name || root.type) + (root.userData?.kind ? ':' + root.userData.kind : '') + ' ' + Object.keys(root.userData || {}).slice(0, 3).join(',');
                    const near = (x, z) => Math.hypot(x - hp.x, z - hp.z) <= R;
                    if (o.isInstancedMesh) { let c = 0; for (let i = 0; i < Math.min(o.count, 400); i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); if (near(v.x, v.z)) c++; } if (c) found[key + ' [inst ' + o.count + ']'] = (found[key + ' [inst ' + o.count + ']'] || 0) + c; }
                    else if (o.isSkinnedMesh && o.userData.farBatch) { const bm = o.skeleton.boneMatrices; let c = 0; for (let i = 0; i + 15 < bm.length; i += 16) { if (bm[i + 15] === 0) continue; if (near(bm[i + 12], bm[i + 14])) { c++; const kk = Math.round(bm[i + 12]) + '/' + Math.round(bm[i + 13]) + '/' + Math.round(bm[i + 14]); (window.__pos = window.__pos || {})[kk] = ((window.__pos || {})[kk] || 0) + 1; } } if (c) found['FARBATCH bones near'] = (found['FARBATCH bones near'] || 0) + c; }
                    else if (o.isSkinnedMesh && o.skeleton.bones[0]) { o.skeleton.bones[0].getWorldPosition(v); if (near(v.x, v.z)) found[key + ' (skinned, bone0)'] = (found[key + ' (skinned, bone0)'] || 0) + 1; }
                    else { o.getWorldPosition(v); if (near(v.x, v.z)) found[key] = (found[key] || 0) + 1; }
                });
                window.__first.frames.push(found);
            }
            const res = orig(scene, cam);
            if (g.revealed && scene === g.scene && n <= FR) {
                for (const sl of window.__FB.farBatchInspect()) { const bm = sl.mesh.skeleton.boneMatrices; let bad = -1; for (let b = 0; b < sl.n; b++) { const o = (sl.base + b) * 16; if (bm[o + 15] !== 0 && Math.abs(bm[o + 12]) + Math.abs(bm[o + 13]) + Math.abs(bm[o + 14]) < 0.5) { bad = b; break; } } if (sl.shown && bad >= 0) { sl.badBone = bad; const { mesh, ...r } = sl; window.__ident.push({ frame: n, ...r }); } }
            }
            if (g.revealed && scene === g.scene && n <= FR) scene.traverse((o) => {
                if (!o.isSkinnedMesh || o.userData.farBatch || !o.visible || o === g.character.group) return;
                for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
                let root = o; while (root.parent && root.parent !== scene) root = root.parent;
                if (root === g.character.group || root.name === 'weapon') return;
                const re = root.matrixWorld.elements; if (Math.abs(re[12]) + Math.abs(re[14]) < 3) return;
                for (const b of o.skeleton.bones) { const e = b.matrixWorld.elements; if (Math.abs(e[12]) + Math.abs(e[13]) + Math.abs(e[14]) < 0.5) { window.__ident.push({ frame: n, own: root.name || root.type, ud: Object.keys(root.userData).join(','), at: [re[12], re[13], re[14]] }); return; } }
            });
            return res;
        };
    }, 5);
}, [R, FR]);
await page.waitForFunction(() => document.querySelector('.mode-card[data-mode]'));
if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
await page.click(`.mode-card[data-mode="${MODE}"]`);
await page.evaluate(() => { for (const [id, v] of [['graphics-quality', '0'], ['view-distance', 'low'], ['villager-ai', 'off'], ['villager-voice', '0']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } } });
await page.click('#start-btn');
await page.waitForFunction(() => window.__first?.frames.length >= 5, null, { timeout: 300000 });
await page.waitForTimeout(8000);
const fr = await page.evaluate(() => window.__first.frames);
const agg = {}; fr.forEach((f, i) => { for (const [k, c] of Object.entries(f)) { const a = agg[k] || (agg[k] = { first: i, last: i, max: 0, frames: 0 }); a.last = i; a.frames++; a.max = Math.max(a.max, c); } });
console.log('frames recorded', fr.length);
console.log('IDENTITY-BONE SLOTS', JSON.stringify((await page.evaluate(() => window.__ident)).slice(0, 1))); console.log('batch bone positions', JSON.stringify(await page.evaluate(() => window.__pos)));
for (const [k, a] of Object.entries(agg).sort((x, y) => x[1].first - y[1].first)) console.log(`${k} — frames ${a.first}..${a.last} (${a.frames}), up to ${a.max} parts within ${R} m`);
await browser.close(); srv.stop();
