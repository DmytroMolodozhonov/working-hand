#!/usr/bin/env node
/**
 * entrybench.mjs — вход в мир, замер (жалоба автора: «при заходе в Творческий игра зависла на ~3 минуты»).
 *   node tools/entrybench.mjs [--spot start|dragon|queen|...] [--gen 17] [--cpu 4] [--check] [--mode creative]
 *
 * От нажатия «Начать» до первого кадра игры и до «земля вокруг готова»: время, самая долгая непрерывная
 * работа главного потока (Long Tasks) и список самых долгих задач со стеком вызова (кто занял поток).
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SPOT = opt('spot', 'start');
const MODE = opt('mode', 'creative');
const CPU = parseFloat(opt('cpu', '1'));
const GEN = opt('gen', null);
const CHECK = args.includes('--check');
const PROFILE = args.includes('--profile');
const AFTER = parseFloat(opt('after', '10'));
const window0 = () => 0;
/** --check: пороги входа (только ужесточать). */
const LIMITS = { afterMs: 120, longestMs: 9000, firstFrameS: 100, groundS: 200 }; // (в контейнере видеокарта программная — шейдеры и буферы в ней медленные: 29.10 до правки самая долгая задача 30 с, после 7 с; на настоящей видеокарте в разы меньше. Только ужесточать)

const port = 8900 + Math.floor(Math.random() * 100);
const srv = await startServer(port);
const browser = await launch();
let out = 0;
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } });
    const cdp = await page.context().newCDPSession(page);
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.evaluate(() => {
        window.__lt = [];
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
    });
    if (PROFILE) await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }), await cdp.send('Profiler.start');
    const t0 = await page.evaluate((a) => {
        const z = window.__zns, t = performance.now();
        const cfg = { ...z.readConfig(), mode: a.MODE, map: null, seed: 20261015, zombieCount: 0 };
        if (a.MODE === 'creative') cfg.hero = { ...(cfg.hero || {}), spawn: a.SPOT };
        if (a.GEN) cfg.gen = +a.GEN;
        window.__t0 = t;
        z.startGame(cfg);
        return t;
    }, { MODE, SPOT, GEN });
    const stamp = {};
    const poll = async (name, fn, timeout) => {
        const s = Date.now();
        while (Date.now() - s < timeout) {
            if (await page.evaluate(fn).catch(() => false)) { stamp[name] = (Date.now() - s) ; return; }
            await sleep(100);
        }
        stamp[name] = null;
    };
    const w0 = Date.now();
    await poll('active', () => !!(window.__zns.game && window.__zns.game.active), 300000);
    const tActive = (Date.now() - w0) / 1000;
    await poll('frame', () => window.__zns.game.frameCount > 3, 300000);
    const tFrame = (Date.now() - w0) / 1000;
    await poll('ground', () => { const g = window.__zns.game; return (g.terrain._queue?.length ?? 1) === 0 && g.frameCount > 120; }, 300000);
    const tGround = (Date.now() - w0) / 1000;
    // после закрытия экрана загрузки: сколько долгих задач в первые 10 с (жалоба 29.10: «секунд 5 игра подвисает»)
    await poll('reveal', () => window.__zns.game.revealed === true, 300000);
    await page.evaluate(() => { window.__tr = performance.now(); window.__trF = window.__zns.game.frameCount; });
    await sleep(Math.round(AFTER * 1000));
    const post = await page.evaluate(() => {
        const g = window.__zns.game;
        return { frames: g.frameCount - window.__trF, queue: g.terrain?._queue?.length ?? -1, lt: window.__lt.filter((e) => e.t >= window.__tr).sort((a, b) => b.d - a.d) };
    });
    const lt = await page.evaluate(() => window.__lt.filter((e) => e.t >= window.__t0).sort((a, b) => b.d - a.d));
    console.log(`\n=== вход: ${MODE}, место ${SPOT}${GEN ? ', поколение ' + GEN : ''}, CPU ×${CPU}`);
    console.log(`игра началась: ${tActive.toFixed(1)} с, первый кадр: ${tFrame.toFixed(1)} с, земля готова: ${tGround.toFixed(1)} с`);
    console.log(`долгих задач: ${lt.length}, самая долгая: ${(lt[0]?.d || 0).toFixed(0)} мс, сумма: ${(lt.reduce((a, b) => a + b.d, 0) / 1000).toFixed(1)} с`);
    for (const e of lt.slice(0, 8)) console.log(`   +${((e.t - t0) / 1000).toFixed(1)} с  ${e.d.toFixed(0)} мс`);
    console.log(`ПОСЛЕ ЗАКРЫТИЯ ЭКРАНА (${AFTER} с): кадров ${post.frames}, очередь чанков ${post.queue}, долгих задач ${post.lt.length}, самая долгая ${(post.lt[0]?.d || 0).toFixed(0)} мс, сумма ${(post.lt.reduce((a, b) => a + b.d, 0) / 1000).toFixed(1)} с`);
    for (const e of post.lt.slice(0, 8)) console.log(`   +${((e.t - window0(e)) / 1000).toFixed(1)} с  ${e.d.toFixed(0)} мс`);
    const inf = await page.evaluate(() => { const g = window.__zns.game, i = g.renderer.info; const by = {}; for (const p of i.programs) by[p.name] = (by[p.name] || 0) + 1; return { programs: i.programs.length, geometries: i.memory.geometries, textures: i.memory.textures, by, prewarmed: g.prewarmedPrograms, late: i.programs.slice(g.prewarmedPrograms).map((p) => `${p.name} | ${String(p.cacheKey).slice(0, 160)}`) }; });
    console.log(`шейдеров: ${inf.programs} (после прогрева ${inf.prewarmed}), геометрий ${inf.geometries}, текстур ${inf.textures}`, JSON.stringify(inf.by));
    const who = await page.evaluate(() => { const g = window.__zns.game, r = g.renderer, late = new Set(r.info.programs.slice(g.prewarmedPrograms).map((p) => p.cacheKey)), out = [];
        g.scene.traverse((o) => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) { const pr = r.properties.get(m)?.currentProgram; if (pr && late.has(pr.cacheKey)) { const chain = []; for (let q = o; q && chain.length < 6; q = q.parent) chain.push(q.name || q.type); out.push(`${o.type} «${o.name}» verts ${o.geometry?.attributes?.position?.count} mat ${m.type} ${m.name} color ${m.color?.getHexString?.()} map ${!!m.map} flat ${m.flatShading} vc ${m.vertexColors} | ${chain.join(' < ')}`); } } });
        return out.slice(0, 6); }).catch((e) => [String(e)]);
    for (const w of who) console.log('   кто собрал: ' + w);
    for (const l of inf.late) console.log('   после прогрева собран шейдер: ' + l);
    if (PROFILE) {
        const { profile } = await cdp.send('Profiler.stop');
        const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
        const dt = profile.timeDeltas;
        profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
        // (вместе с вызванным: кто держал поток — по цепочке родителей)
        const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
        const incl = new Map();
        profile.samples.forEach((id, i) => { const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const n = byId.get(x); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) || 0) + (dt[i] || 0)); } });
        console.log('\nвместе с вызванным (мс):');
        for (const [k, v] of [...incl.entries()].filter(([k]) => !/idle|\(root\)|\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)}  ${k}`);
        console.log('\nсамое тяжёлое (само по себе, мс):');
        for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)}  ${k}`);
    }
    const errs = errors.filter((e) => !/ERR_TUNNEL|ERR_NAME|XNNPACK|Web Speech|AudioContext|favicon|WebGL|GPU stall|GL Driver/i.test(e));
    if (errs.length) console.log('ошибки:', errs.slice(0, 5));
    if (CHECK) {
        const bad = [];
        if ((lt[0]?.d || 0) > LIMITS.longestMs) bad.push(`самая долгая задача ${lt[0].d.toFixed(0)} мс > ${LIMITS.longestMs}`);
        if ((post.lt[0]?.d || 0) > LIMITS.afterMs) bad.push(`после закрытия экрана задача ${post.lt[0].d.toFixed(0)} мс > ${LIMITS.afterMs}`);
        if (tFrame > LIMITS.firstFrameS) bad.push(`первый кадр ${tFrame.toFixed(1)} с > ${LIMITS.firstFrameS}`);
        if (tGround > LIMITS.groundS) bad.push(`земля ${tGround.toFixed(1)} с > ${LIMITS.groundS}`);
        if (bad.length) { console.log('ПРОВАЛ:\n  ' + bad.join('\n  ')); out = 1; } else console.log('ОК');
    }
} finally {
    await browser.close();
    srv.stop();
}
process.exit(out);
