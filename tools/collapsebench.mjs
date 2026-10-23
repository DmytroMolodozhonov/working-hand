#!/usr/bin/env node
/**
 * collapsebench.mjs — buildings coming down in the real game (Structure.js, Collapse.Settling, FallingBlocks):
 * what falls, in how many rounds, and what it costs a frame. Run:
 *     node tools/collapsebench.mjs [--only колонны,угол,бомбардо,разрушение] [--seed 20261015] [--check]
 *
 * Творческий, the same world every run; the hero is put by the nearest castle:
 *   «колонны»    — a stone roof 7×7 on four posts built by the castle: three posts blasted away → the roof must fall;
 *                  then a second one: one post blasted → it must stand;
 *   «колонна»    — a two-storey stone house; its ground floor taken away (Builder edits, as «Gather» or a hand) but one
 *                  corner column 1×1 → the house must fall;
 *   «угол»       — the castle's biggest hall: the column at its corner (the walls' corner) blasted («Бомбардо Максима»);
 *   «бомбардо»   — «Бомбардо Максима» ×3 into the castle's walls;
 *   «разрушение» — «Total Destruction» at the castle's keep.
 * For each: the blocks that fell after it (and in how many rounds), the game's work in a frame while it settled (the
 * mean, the worst frame, frames over 8 ms) and the most the checks of the buildings took in one frame.
 * --check: fails if «колонны»/«колонна» did not come down as they must, or a check took more than 6 ms in a frame.
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const ONLY = opt('only', null)?.split(',') || null;
const SEED = Number(opt('seed', '20261015'));
const CHECK = args.includes('--check');

function install(args0) {
    const g = window.__zns.game;
    const B = window.__cb = { frames: [], rec: false, settle: 0, falls: [] };
    let nr = 0;
    const origRender = g.renderer.render.bind(g.renderer);
    g.renderer.render = function (scene, camera) { if (scene !== g.scene || ++nr % 15 === 0) return origRender(scene, camera); };
    const S = g.world.terrain.data.settling;
    const step = S.step.bind(S);
    S.step = function (ms) { const t = performance.now(); B.inSettle = true; try { return step(ms); } finally { B.inSettle = false; const d = performance.now() - t; B.cur = (B.cur || 0) + d; if (d > 6 && args0.jobs) console.log(`flush-step ${d.toFixed(1)} ms, chunks made in it so far ${B.gen}, jobs ${S.jobs.length}`); } };
    const dd = g.world.terrain.data, gen = dd._generateChunk.bind(dd);
    B.gen = 0;
    dd._generateChunk = function (cx, cz) { if (B.inSettle) B.gen++; return gen(cx, cz); };
    const addJob = S.add.bind(S);
    B.jobs = [];
    S.add = function (job, done) {
        const st = job.step.bind(job), rec = { box: job.B ? `${job.B.NX}x${job.B.NY}x${job.B.NZ}` : '?', calls: 0, max: 0, total: 0, idle: job.done };
        B.jobs.push(rec);
        job.step = function (ms) { const t = performance.now(); try { return st(ms); } finally { const d = performance.now() - t; rec.calls++; rec.total += d; if (d > rec.max) rec.max = d; } };
        return addJob(job, done);
    };
    const flush = S.flush.bind(S);
    S.flush = function () { const t = performance.now(), n = S.jobs.length; try { return flush(); } finally { const d = performance.now() - t; B.cur = (B.cur || 0) + d; if (n && args0.jobs) console.log(`flush ${n} ${d.toFixed(1)} ${new Error().stack.split('\n').slice(2, 5).join(' < ').replace(/https?:[^ )]+\//g, '')}`); } };
    const col = g._collapsed.bind(g);
    g._collapsed = function (falls) {
        B.falls.push(...falls.map((f) => ({ n: f.cells.length, s: f.stage || 0, c: !!f.crushed })));
        const t = performance.now();
        try { return col(falls); } finally { B.react = (B.react || 0) + performance.now() - t; }
    };
    const add = g.falling.add.bind(g.falling);
    g.falling.add = function (f) { if (B.rec && !(f.stage > 0) && f.d > 0) B.falls.push({ n: f.cells.length, s: 0, c: false, old: true }); return add(f); };
    const origFrame = g.frame.bind(g);
    g.frame = function () {
        const t0 = performance.now();
        B.cur = 0; B.react = 0;
        origFrame();
        const t1 = performance.now();
        if (B.rec) B.frames.push({ game: t1 - t0 - (g._parts?.['графика'] || 0), settle: B.cur - B.react, react: B.react });
    };
}

const report = (name, r) => {
    const f = r.frames.map((x) => x.game).sort((a, b) => a - b);
    const mean = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
    const fell = r.falls.filter((x) => !x.old).reduce((a, x) => a + x.n, 0), old = r.falls.filter((x) => x.old).reduce((a, x) => a + x.n, 0);
    const rounds = Math.max(0, ...r.falls.map((x) => x.s)), crushed = r.falls.filter((x) => x.c).reduce((a, x) => a + x.n, 0);
    console.log(`${name.padEnd(12)} упало: ${String(fell).padStart(5)} блоков по физике (волн ${rounds}, раздавлено ${crushed}), ${old} — висевших в воздухе | кадр игры: ` +
        `средний ${mean.toFixed(1)} мс, худший ${(f[f.length - 1] || 0).toFixed(1)}, >8 мс: ${f.filter((x) => x > 8).length} из ${f.length} | проверка зданий за кадр: до ${Math.max(0, ...r.frames.map((x) => x.settle)).toFixed(1)} мс` +
        ` (реакция игры на обрушение: до ${Math.max(0, ...r.frames.map((x) => x.react)).toFixed(1)} мс)` + (r.note ? ` | ${r.note}` : ''));
    return { fell, rounds, settleMax: Math.max(0, ...r.frames.map((x) => x.settle)) };
};

const scenarios = {
    // a roof 7×7 on four stone posts, by the castle; three posts blasted (each a «Бомбардо» at the post)
    async 'колонны'(page) {
        return page.evaluate(async () => {
            const g = window.__zns.game, d = g.world.terrain.data, B = window.__cb;
            const p = g.character.group.position, S = 25;
            const at = (k) => { const x = Math.round(p.x + 25 + k * 14), z = Math.round(p.z); return { x, z, y: d.topLayer(x, z) }; };
            const out = [];
            for (const [k, posts] of [[0, 3], [1, 1]]) {
                const { x, z, y } = at(k);
                const set = (a, L, b, t) => d.set(a, L, b, t);
                for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let L = y + 1; L <= y + 6; L++) set(x + dx, L, z + dz, 0);
                for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (let L = y + 1; L <= y + 4; L++) set(x + a, L, z + b, S);
                for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) set(x + dx, y + 5, z + dz, S);
                g.world.terrain.rebuildDirty?.();
                await new Promise((r) => setTimeout(r, 1500));
                B.rec = true;
                for (const [a, b] of [[3, -3], [3, 3], [-3, 3]].slice(0, posts)) { g.explode(new (g.character.group.position.constructor)(x + a, y + 1.5, z + b), 1.6, 'local', 1); await new Promise((r) => setTimeout(r, 120)); }
                await new Promise((r) => setTimeout(r, 4500));
                let left = 0;
                for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (d.get(x + dx, y + 5, z + dz) === S) left++;
                out.push(left);
            }
            return { note: `крыша на 4 столбах: выбили 3 — осталось наверху ${out[0]} из 49; выбили 1 — осталось ${out[1]} из 49`, ok: out[0] < 10 && out[1] >= 45 };
        });
    },
    // a two-storey stone house: its ground floor blasted away round one corner column
    async 'колонна'(page) {
        return page.evaluate(async () => {
            const g = window.__zns.game, d = g.world.terrain.data, B = window.__cb, V = g.character.group.position.constructor;
            const p = g.character.group.position, S = 25;
            const x = Math.round(p.x - 30), z = Math.round(p.z), y = d.topLayer(x, z);
            const box = (x0, L0, z0, x1, L1, z1, t) => { for (let L = L0; L <= L1; L++) for (let b = z0; b <= z1; b++) for (let a = x0; a <= x1; a++) d.set(a, L, b, t); };
            box(x - 5, y + 1, z - 5, x + 5, y + 14, z + 5, 0);
            box(x - 4, y + 1, z - 4, x + 4, y + 4, z + 4, S); box(x - 3, y + 1, z - 3, x + 3, y + 4, z + 3, 0);
            box(x - 4, y + 5, z - 4, x + 4, y + 5, z + 4, S); box(x - 4, y + 6, z - 4, x + 4, y + 9, z + 4, S); box(x - 3, y + 6, z - 3, x + 3, y + 9, z + 3, 0);
            box(x - 4, y + 10, z - 4, x + 4, y + 10, z + 4, S);
            await new Promise((r) => setTimeout(r, 1500));
            B.rec = true;
            // the walls of the ground floor taken away, all but the corner column (x−4, z−4) — as a hand or a spell takes
            // blocks (Builder edits: the house round them is looked at, its fall goes to everybody as edits)
            const edits = [];
            for (let L = y + 1; L <= y + 4; L++) for (let b = z - 4; b <= z + 4; b++) for (let a = x - 4; a <= x + 4; a++) {
                if ((a === x - 4 && b === z - 4) || d.get(a, L, b) !== S) continue;
                d.set(a, L, b, 0); edits.push([a, L, b, 0]);
            }
            g.builder._sendEdits(edits, true);
            await new Promise((r) => setTimeout(r, 6000));
            let left = 0;
            for (let L = y + 5; L <= y + 10; L++) for (let b = z - 4; b <= z + 4; b++) for (let a = x - 4; a <= x + 4; a++) if (d.get(a, L, b) === S) left++;
            return { note: `дом на одной колонне: наверху осталось ${left} блоков из 210`, ok: left < 40 };
        });
    },
    async 'угол'(page) {
        return page.evaluate(async () => {
            const g = window.__zns.game, d = g.world.terrain.data, B = window.__cb, V = g.character.group.position.constructor;
            const c = window.__cbSite;
            // the biggest hall: the room with the widest ceiling near the castle's middle — look for the corner of a ceiling
            // (a column of stone under a ceiling with air beside it on two sides)
            let best = null;
            for (let z = Math.round(c.z) - 40; z <= c.z + 40; z++) for (let x = Math.round(c.x) - 40; x <= c.x + 40; x++) {
                const top = d.topLayer(x, z);
                for (let L = top; L > top - 30 && L > 0; L--) {
                    if (d.get(x, L, z) !== 0) continue;
                    // air under a ceiling: how wide is the air here (a hall)?
                    let w = 0;
                    for (let k = 1; k < 12; k++) if (d.get(x + k, L, z) === 0 && d.get(x, L, z + k) === 0) w++; else break;
                    if (w >= 8 && d.get(x - 1, L, z) && d.get(x, L, z - 1) && (!best || w > best.w)) best = { x: x - 1, L, z: z - 1, w };
                    break;
                }
            }
            if (!best) return { note: 'зала не нашёл', ok: true };
            B.rec = true;
            g.explode(new V(best.x, best.L - 1, best.z), 4.5, 'local', 3);
            await new Promise((r) => setTimeout(r, 7000));
            return { note: `угол зала ${best.x},${best.L},${best.z} (ширина ≥${best.w})`, ok: true };
        });
    },
    async 'бомбардо'(page) {
        return page.evaluate(async () => {
            const g = window.__zns.game, d = g.world.terrain.data, B = window.__cb, V = g.character.group.position.constructor;
            const c = window.__cbSite;
            B.rec = true;
            for (const [dx, dz] of [[-10, 0], [8, 6], [0, -12]]) {
                const x = Math.round(c.x + dx), z = Math.round(c.z + dz), y = d.topLayer(x, z);
                g.explode(new V(x, y - 4, z), 6, 'local', 3);
                await new Promise((r) => setTimeout(r, 3500));
            }
            return { ok: true };
        });
    },
    async 'разрушение'(page) {
        return page.evaluate(async () => {
            const g = window.__zns.game, d = g.world.terrain.data, B = window.__cb, V = g.character.group.position.constructor;
            const c = window.__cbSite;
            B.rec = true;
            const x = Math.round(c.x + 20), z = Math.round(c.z + 20), y = d.topLayer(x, z);
            const out = g.world.ruin(new V(x, y - 2, z), 20);
            for (const f of out.falls || []) g.falling?.add(f);
            await new Promise((r) => setTimeout(r, 9000));
            return { ok: true };
        });
    },
};

const port = 8900 + Math.floor(Math.random() * 90);
const srv = await startServer(port);
const browser = await launch();
let bad = 0;
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } });
    page.on('pageerror', (e) => console.log('ошибка в игре:', e.message));
    await page.evaluate(({ SEED }) => {
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '2', viewDistance: 'medium' });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(3000);
    const site = await page.evaluate(() => {
        const g = window.__zns.game, data = g.terrain.data, p0 = g.character.group.position.clone();
        const s = (data.castles?.near?.(p0.x, p0.z, 1500) || []).sort((a, b) => Math.hypot(a.x - p0.x, a.z - p0.z) - Math.hypot(b.x - p0.x, b.z - p0.z))[0];
        window.__cbSite = { x: s.x, z: s.z, id: s.id };
        const y = g.collision.groundY(s.x + 45, s.z);
        g.character.group.position.set(s.x + 45, (Number.isFinite(y) ? y : 20) + 4, s.z);
        g.flight?.start?.();
        return { id: s.id, x: s.x, z: s.z };
    });
    console.log(`замок ${site.id} (${site.x.toFixed(0)}, ${site.z.toFixed(0)})`);
    await sleep(12000); // (its land and its people)
    page.on('console', (m) => { if (m.text().startsWith('flush')) console.log('   ', m.text()); });
    await page.evaluate(install, { jobs: args.includes('--jobs') });
    for (const [name, fn] of Object.entries(scenarios)) {
        if (ONLY && !ONLY.includes(name)) continue;
        await page.evaluate(() => { const B = window.__cb; B.frames.length = 0; B.falls.length = 0; B.rec = false; });
        const res = await fn(page);
        const r = await page.evaluate(() => ({ frames: window.__cb.frames, falls: window.__cb.falls, jobs: window.__cb.jobs.splice(0) }));
        if (args.includes('--jobs')) {
            for (const j of r.jobs.filter((x) => !x.idle)) console.log(`    проверка ${j.box}: шагов ${j.calls}, всего ${j.total.toFixed(1)} мс, самый долгий шаг ${j.max.toFixed(1)} мс`);
            console.log('    долгие куски:', JSON.stringify(await page.evaluate(async () => (await import('/src/world/Structure.js')).STATS.slow.splice(0))));
        }
        const sum = report(name, { ...r, note: res?.note });
        if (CHECK && (res?.ok === false || sum.settleMax > 6)) { bad++; console.log(`  ✗ ${name}: не так, как должно`); }
    }
} finally {
    await browser.close();
    srv.stop?.();
}
if (CHECK && bad) process.exit(1);
process.exit(0);
