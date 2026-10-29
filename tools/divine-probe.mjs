// Live check of «Да пусть создастся …» in a real browser (Creative): the voice path, the seed, the gods' answer
// (no network here — the rules), the creature/plant/building made, any page error.
// Usage: ZNS_CHROME=/opt/pw-browsers/chromium node tools/divine-probe.mjs ["описание"]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from '../tests/e2e/harness.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (process.argv[2]?.startsWith('--')) process.argv.splice(2, 0, '');
const srv = await startServer(Number(process.env.PORT) || 8231);
const browser = await launch({});
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    page.on('console', (m) => { const t = m.text(); if (/creation|divine|DivineCreation|frame error/i.test(t)) console.log('console:', t.slice(0, 300)); });
    try { await startFromMenu(page, 'creative'); } catch (e) {
        console.log('start slow:', e.message.split('\n')[0], realErrors(errors).slice(0, 5));
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 400000 });
    }
    await waitHudVisible(page, 300000);
    const descs = process.argv[2] ? [process.argv[2]] : ['будет оно белое | и шерсть пушистая', 'дерево с синими листьями которое светится', 'башня из белого камня с синей крышей'];
    const shots = path.resolve(arg('--out', '/tmp/divine-shots'));
    fs.mkdirSync(shots, { recursive: true });
    for (const [n, desc] of descs.entries()) {
        const r = await page.evaluate(async (desc) => {
            const g = window.__zns.game, d = g.divine, out = [];
            const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
            const said = []; const sv = g.hud.setVoice; g.hud.setVoice = (t, ...a) => { said.push(t); return sv.call(g.hud, t, ...a); };
            d._lastCast = 0;
            out.push(['lone', g._castLocalSpell('да пусть создастся', true), d.listening ? 'listening' : '']);
            await new Promise((r) => setTimeout(r, 1700));
            // (the description in two phrases, as the recognizer cuts a long one: the gods keep both till the quiet)
            const parts = desc.split(' | ');
            for (const p of parts) { out.push(['part', g._castLocalSpell(p, false), g._castLocalSpell(p, true)]); await new Promise((r) => setTimeout(r, 300)); }
            out.push(['listening', !!d.listening, d.listening?.at ? 'seed at the wand' : 'no seed yet']);
            let i = 0;
            for (; i < 3000 && (d.listening || d.magic || d.mine); i++) { if (i % 3) d.update(0.1); await frame(); if (i % 100 === 0) out.push(['t', i, d.listening ? 'listening' : '', d.magic?.phase, d.magic?.desc]); }
            for (let k = 0; k < 60; k++) await frame();
            g.hud.setVoice = sv;
            return { out, frames: i, said, journal: [...(g.spellLog?.lines || [])].filter((l) => /создастся/.test(l)).slice(-14), sounds: ['loopGenesisEpic', 'stCreationHeard', 'thCreation'].map((k) => k + ':' + !!g.sound?.sounds?.[k]), creatures: g.customCreatures?.list.length, plants: g.customPlants?.list.length, builds: d.list?.size };
        }, desc);
        console.log(desc, JSON.stringify(r));
        await page.screenshot({ path: path.join(shots, `divine-${n}.png`) });
    }
    console.log('errors:', realErrors(errors).filter((e) => !/audio-capture/.test(e)).slice(0, 10));
} finally { await browser.close(); srv.stop?.(); }
process.exit(0);
