// In the real game (Creative): a lump of ground lifted by «Вингардиум Левиоса Максима» seen next to the same ground.
// Usage: node tools/levmax-shot.mjs [--out docs/levmax] [--dist 9]
import { startServer, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/levmax'));
const dist = Number(arg('--dist', 9));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8797)));
const exe = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    if (process.argv.includes('--shatter')) await page.evaluate(() => { window.__SHATTER = true; });
    if (process.argv.includes('--ultra')) await page.evaluate(() => { window.__ULTRA = true; });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async (dist) => {
        const g = window.__zns.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        await frames(30);
        if (window.__ULTRA) { g.ultra.set(true); await frames(60); }
        const me = g.character.group.position, ry = g.character.group.rotation.y;
        const x = Math.round(me.x - Math.sin(ry) * dist), z = Math.round(me.z - Math.cos(ry) * dist);
        const top = data.topLayer(x, z);
        const id = g.localId + ':mt';
        g.levMax.mine = { id, side: 'right', players: [], t: 0, kind: 'earth' };
        const ok = g.levMax.begin(id, g.localId, 'right', { k: 'earth', c: [x, top, z] });
        const L = g.levMax.lifts.get(id);
        await frames(10);
        g.character.group.rotation.y = Math.atan2(-(x - me.x), -(z - me.z));
        await frames(8);
        const T = window.__zns.THREE;
        const cam = g.camera; const sp = cam.position.clone(), sq = cam.quaternion.clone();
        if (window.__SHATTER) {
            const LM = await import('/src/game/LevitationMaxima.js');
            const rnd = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
            const res = LM.rubbleOf(L.cells, 3, 0, (a, b) => data.topLayer(a, b), rnd, 0.5, { v: [0, 0, 0], h: 0, tilt: [0, 0] });
            L.pos.y += 3; L.group.position.copy(L.pos);
            g.levMax._shatter(L, res, { d: [3, 0, 0], v: [0, 0, 0], seed: 1 }, rnd);
            L.group.visible = false;
            window.__shardDbg = g.levMax.shards.map((S) => S.parts.map((q) => [q.idx.length, Array.from(new Set(q.mesh.geometry.getAttribute('voxSky').array)), Array.from(new Set(q.mesh.geometry.getAttribute('voxPat').array))]));
            await frames(2);
        } else { L.group.position.y += 2.5; }
        L.group.updateMatrixWorld(true);
        const P = L.group.position;
        cam.position.set(P.x + 6, P.y + 1.5, P.z + 9);
        cam.lookAt(P.x + 1.5, P.y + 0.5, P.z);
        cam.updateMatrixWorld(true);
        g.renderer.render(g.scene, cam);
        const shot = () => { g.renderer.render(g.scene, cam); return g.renderer.domElement.toDataURL('image/png'); };
        const lm = L.group.children[0];
        window.__shot = shot();
        lm.receiveShadow = false; window.__shotB = shot();
        lm.receiveShadow = true; lm.castShadow = false; window.__shotC = shot(); lm.castShadow = true;
        cam.position.copy(sp); cam.quaternion.copy(sq); cam.updateMatrixWorld(true);
        const { BLOCK, CHUNK } = await import('/src/world/Terrain.js');
        const ch = data.chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
        const dbg = { hasGrass: !!ch.grass, face: data.faceColor(BLOCK.GRASS, x, top, z, true).toString(16), lush: data.lush, chunkKeys: Object.keys(ch).join(',') };
        // the colour of the world's own top faces near the lump
        const tv = g.terrain, found = [];
        for (const m of tv.meshes.values()) {
            const mesh = m.ground || m.raised; const geo = mesh?.geometry; if (!geo || !geo.getAttribute('position')) continue;
            const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), C = geo.getAttribute('color'), V = geo.getAttribute('voxPat');
            for (let i = 0; i < P.count && found.length < 6; i++) if (N.getY(i) > 0.9 && Math.abs(P.getX(i) - x) < 3 && Math.abs(P.getZ(i) - z) < 3 && Math.abs(P.getY(i) - (top - 0.5)) < 0.1) found.push([P.getX(i), P.getZ(i), C.getX(i).toFixed(2), C.getY(i).toFixed(2), C.getZ(i).toFixed(2), V.getX(i)]);
        }
        dbg.world = found;
        const gl = L.group.children[0].geometry; const GC = gl.getAttribute('color'), GN = gl.getAttribute('normal'); dbg.lump = [];
        for (let i = 0; i < GC.count && dbg.lump.length < 3; i++) if (GN.getY(i) > 0.9) dbg.lump.push([GC.getX(i).toFixed(2), GC.getY(i).toFixed(2), GC.getZ(i).toFixed(2)]);
        dbg.shards = window.__shardDbg;
        return { dbg, ok, n: L?.cells?.length, phase: L?.phase, x, z, top, pat: L ? Array.from(new Set(L.group.children[0].geometry.getAttribute('voxPat').array)) : null, sky: L ? Array.from(new Set(L.group.children[0].geometry.getAttribute('voxSky').array)) : null };
    }, dist);
    console.log(JSON.stringify(r));
    for (const [k, n] of [['__shot', 'game-lump'], ['__shotB', 'game-lump-noreceive'], ['__shotC', 'game-lump-nocast']]) fs.writeFileSync(path.join(out, n + '.png'), Buffer.from((await page.evaluate((k) => window[k], k)).split(',')[1], 'base64'));
    console.log('saved', path.join(out, 'game-lump.png'));
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
