// Стенд охоты плотоядной головы (PlantHunt.js — тот же код, что в игре): «макс. скачок положения жертвы» должен быть 0 телепортов.
// Зверь/человек/житель × расстояние × высота × частота кадров × убегает или стоит; печатает самый большой шаг жертвы за кадр,
// длительность фаз и сколько раз жертва была «вне досягаемости» (отпущена). Usage: node tools/huntbench.mjs [--check]
import { Hunt, HUNT, maxPreyStep, neckSpine } from '../src/game/PlantHunt.js';

const check = process.argv.includes('--check');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const kinds = {
    'свинья': { k: 'a', kind: 'a', id: 1, size: 1.45, verdict: 'eat', mid: 0.4 },
    'баран': { k: 'a', kind: 'a', id: 2, size: 1.55, verdict: 'eat', mid: 0.4 },
    'корова': { k: 'a', kind: 'a', id: 3, size: 2.0, verdict: 'eat', mid: 0.5 },
    'игрок без брони': { k: 'p', kind: 'p', id: 'me', size: 3.5, verdict: 'eat', mid: 2.0 },
    'игрок в нагруднике': { k: 'p', kind: 'p', id: 'me', size: 3.5, verdict: 'tire', mid: 2.0 },
    'игрок в магической мантии': { k: 'p', kind: 'p', id: 'me', size: 3.5, verdict: 'spit', mid: 2.0 },
    'житель': { k: 'v', kind: 'v', id: 4, size: 3.5, verdict: 'eat', mid: 1.4 },
};
let worst = 0, runs = 0, lost = 0, stuck = 0, rows = [];
for (const [name, base] of Object.entries(kinds)) {
    let kmax = 0, phases = null;
    for (const fps of [144, 60, 30, 15]) for (const d of [2, 4, 6, 8, 9]) for (const ang of [0, 1.3, 2.6, 4, 5.2]) for (const flee of [0, 1.6, 6]) {
        const dt = 1 / fps, pos0 = [Math.sin(ang) * d, base.mid, Math.cos(ang) * d], h = new Hunt([0.4, 5.8, 0.3], [0, 1, 0], 0);
        const prey = { ...base, inside: false }; h.digestFor = 4;
        h.begin(prey, pos0.slice());
        let last = null, cur = pos0.slice(), t = 0, wasHeld = false; const ph = {};
        for (let i = 0; i < 40 * fps; i++) {
            t = i * dt;
            if (!h.owned) { cur = [pos0[0] + Math.sin(ang) * flee * t, pos0[1], pos0[2] + Math.cos(ang) * flee * t]; }
            h.step(dt, { auth: true, prey: h.owned ? null : cur, alive: true });
            if (!(h.st in ph)) ph[h.st] = t;
            if (h.owned && h.prey) { wasHeld = true; if (last) kmax = Math.max(kmax, dist(h.preyPos, last)); last = h.preyPos.slice(); } else last = null;
            if (h.st === 'idle' && !h.prey && i > 10) break;
            if (i === 40 * fps - 1) stuck++;
        }
        runs++; if (!wasHeld) lost++;
        if (!phases && wasHeld) phases = ph;
        worst = Math.max(worst, kmax / maxPreyStep(dt));
    }
    rows.push([name, kmax.toFixed(3), phases ? Object.entries(phases).map(([k, v]) => k + ' ' + v.toFixed(1)).join(' → ') : '—']);
}
console.log('кто'.padEnd(28), 'макс. шаг жертвы за кадр, м'.padEnd(30), 'начало фаз, с');
for (const r of rows) console.log(r[0].padEnd(28), r[1].padEnd(30), r[2]);
console.log(`прогонов ${runs}; жертва убежала до хвата ${lost}; зависло ${stuck}; ТЕЛЕПОРТОВ 0 если «доля от предела» ≤ 1: ${worst.toFixed(2)}`);
console.log(`шея: покой ${HUNT.REST_NECK} м, растягивается до ×${(HUNT.NECK_MAX / HUNT.REST_NECK).toFixed(2)}; пасть вмещает размер ≤ ${HUNT.FIT} × размер растения`);
if (check && (worst > 1 || stuck)) { console.error('ПРОВАЛ: жертва прыгнула или охота зависла'); process.exit(1); }
