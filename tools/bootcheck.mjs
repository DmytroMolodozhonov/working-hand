#!/usr/bin/env node
/**
 * bootcheck.mjs — the boot cache never changes the game (the author: «быструю загрузку — но НЕ СЛОМАТЬ ИГРУ»).
 *   node tools/bootcheck.mjs [--check] [--keep DIR]
 *
 * Three starts of the same Creative world in one browser profile kept on the disk:
 *   1) «без кеша» (?nocache) — the reference;
 *   2) «холодный» — the cache empty: everything made and written;
 *   3) «тёплый» — the cache read back.
 * After each: the digests of what the cache may hold (BootCache.BOOT.KINDS) and of what it must never touch:
 *   - звуки: every synthesized sound's length, channels, rate — in all three the same; the warm start's samples ARE the cold
 *     start's (bit for bit: what was written is what is read);
 *   - иконки: the pixels of every slot picture made on the loading screen — warm = cold;
 *   - мир: the blocks of the chunks round the start and the hero's place, the inventory — all three the same (the cache never
 *     holds the land, a save or the network: this proves it is untouched).
 * A difference in a kind → take it out of BOOT.KINDS (src/core/BootCache.js) until it is fixed; --check fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const CHECK = args.includes('--check');
const DIR = opt('keep', null) || fs.mkdtempSync(path.join(os.tmpdir(), 'zns-bootcheck-'));
const port = 8800 + Math.floor(Math.random() * 100);
const srv = await startServer(port);

/** One start; returns the digests. */
async function run(label, query) {
    const browser = await launch({ userDataDir: DIR, viewport: { width: 640, height: 360 } });
    try {
        const { page } = await openPage(browser, srv.url + query, { noCamera: true, viewport: { width: 640, height: 360 } });
        const t0 = Date.now();
        await page.evaluate(() => {
            const z = window.__zns;
            z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: 20261015, zombieCount: 0, hero: { ...(z.readConfig().hero || {}), spawn: 'start' } });
        });
        // (the cache's parts are all done before the shaders: waiting for the game's start is enough)
        await page.waitForFunction(() => window.__zns.game?.active, null, { timeout: 900000, polling: 500 });
        const secs = (Date.now() - t0) / 1000;
        const d = await page.evaluate(async () => {
            const g = window.__zns.game;
            const h = (bytes, s = 0x811c9dc5) => { for (let i = 0; i < bytes.length; i++) { s ^= bytes[i]; s = Math.imul(s, 0x01000193) >>> 0; } return s >>> 0; };
            const hx = (a) => h(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).toString(16);
            const out = { sounds: {}, soundShape: {}, icons: {}, world: null, state: null, cache: null };
            const kept = new Set([...(g.sound?._synthed || []), ...(g.sound?._fromCache || [])]); // (what the cache may hold)
            for (const [k, b] of Object.entries(g.sound?.sounds || {})) {
                if (!(b instanceof AudioBuffer) || !kept.has(k)) continue;
                out.soundShape[k] = `${b.numberOfChannels}×${b.length}@${b.sampleRate}`;
                out.sounds[k] = b.sampleRate + ':' + Array.from({ length: b.numberOfChannels }, (_, i) => hx(b.getChannelData(i))).join(',');
            }
            // (the pictures: each decoded to its pixels — a data URL or a blob, the same picture gives the same pixels)
            const cv = document.createElement('canvas'); cv.width = cv.height = 80;
            const cx = cv.getContext('2d', { willReadFrequently: true });
            for (const [k, url] of g.itemIcons?.cache || []) {
                const img = new Image();
                await new Promise((r) => { img.onload = r; img.onerror = r; img.src = url; });
                cx.clearRect(0, 0, 80, 80); cx.drawImage(img, 0, 0);
                out.icons[k] = h(cx.getImageData(0, 0, 80, 80).data).toString(16);
            }
            const t = g.terrain?.data, p = g.character.group.position;
            let w = 0x811c9dc5, n = 0;
            const cx0 = Math.floor(p.x / 16), cz0 = Math.floor(p.z / 16);
            for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
                const c = t?.hasChunk?.(cx0 + dx, cz0 + dz) ? t.chunk(cx0 + dx, cz0 + dz) : null;
                const blocks = c?.blocks || c?.data || c;
                if (ArrayBuffer.isView(blocks)) { w = h(new Uint8Array(blocks.buffer, blocks.byteOffset, blocks.byteLength), w); n++; }
            }
            out.world = `${n} кусков, ${(w >>> 0).toString(16)}`;
            out.state = JSON.stringify({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), slots: (g.inventory?.slots || []).map((it) => it && it.kind), seed: g.seed, gen: g.gen });
            out.cache = window.__zns.boot?.cache || null;
            return out;
        });
        console.log(`${label}: игра началась через ${secs.toFixed(1)} с; звуков ${Object.keys(d.sounds).length}, иконок ${Object.keys(d.icons).length}, мир ${d.world}`);
        return d;
    } finally {
        await browser.close();
    }
}

let bad = [];
try {
    const ref = await run('без кеша  ', '?nocache=1');
    const cold = await run('холодный  ', '');
    await sleep(500);
    const warm = await run('тёплый    ', '');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const cmp = (name, ok, why = '') => { console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — ' + why}`); if (!ok) bad.push(name); };
    // (many sounds and pictures are random by design — a new variant each start, with no cache too: «случайные» are told
    // apart as those where two fresh starts — без кеша and холодный — already differ; the rest must be the same everywhere)
    const shapeDiff = Object.keys(ref.soundShape).filter((k) => ref.soundShape[k] !== warm.soundShape[k] && ref.soundShape[k] === cold.soundShape[k]);
    const missing = Object.keys(ref.soundShape).filter((k) => !(k in warm.soundShape)).concat(Object.keys(warm.soundShape).filter((k) => !(k in ref.soundShape)));
    cmp('звуки: тот же набор и размеры (без кеша = тёплый)', !shapeDiff.length && !missing.length, [...shapeDiff, ...missing].slice(0, 8).join(', '));
    const randS = Object.keys(ref.sounds).filter((k) => ref.sounds[k] !== cold.sounds[k]).length;
    console.log(`  (звуков со случайностью — разные в двух запусках без кеша: ${randS} из ${Object.keys(ref.sounds).length})`);
    const diffS = Object.keys(warm.sounds).filter((k) => cold.sounds[k] !== warm.sounds[k]);
    cmp('звуки: тёплый запуск играет ровно то, что записал холодный (бит в бит)', diffS.length === 0, diffS.slice(0, 6).join(', '));
    const diffI = Object.keys(warm.icons).filter((k) => k in cold.icons && cold.icons[k] !== warm.icons[k]);
    cmp('иконки вещей: тёплый = холодный по пикселям', diffI.length === 0, diffI.slice(0, 6).join(', '));
    const randI = Object.keys(ref.icons).filter((k) => k in cold.icons && ref.icons[k] !== cold.icons[k]);
    const diffR = Object.keys(warm.icons).filter((k) => k in ref.icons && k in cold.icons && ref.icons[k] === cold.icons[k] && ref.icons[k] !== warm.icons[k]);
    cmp('иконки вещей: тёплый = без кеша по пикселям (кроме случайных по природе)', diffR.length === 0, diffR.slice(0, 6).join(', '));
    if (randI.length) console.log(`  (иконки со случайной текстурой — разные и без кеша: ${randI.join(', ')})`);
    cmp('мир у старта: те же блоки', ref.world === cold.world && cold.world === warm.world, `${ref.world} / ${cold.world} / ${warm.world}`);
    cmp('состояние игры (место героя, вещи, сид, поколение)', ref.state === cold.state && cold.state === warm.state, `${ref.state} / ${warm.state}`);
    console.log('  кеш без кеша:', ref.cache);
    console.log('  кеш холодный:', cold.cache);
    console.log('  кеш тёплый:  ', warm.cache);
    if (!/из кеша/.test(warm.cache || '') || /звуки 0 из кеша/.test(warm.cache || '')) { console.log('  ✗ тёплый запуск ничего не взял из кеша'); bad.push('попадания'); }
} finally {
    srv.stop();
    if (!opt('keep', null)) try { fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* (a temporary folder) */ }
}
console.log(bad.length ? `РАЗЛИЧИЯ: ${bad.join('; ')} — этот вид данных убрать из BOOT.KINDS` : 'ОК: с кешем и без — одинаково');
process.exit(CHECK && bad.length ? 1 : 0);
