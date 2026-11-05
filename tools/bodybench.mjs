#!/usr/bin/env node
/**
 * bodybench — «тело не проходит сквозь твёрдое»: тесные дома × все толчки (10–60 м/с, 16 углов) × все виды тел.
 *   node tools/bodybench.mjs [--check] [--n 300]
 * Три замера на одном домике (стены из блоков, кровать, сундук, шкаф, ступени, с дверным проёмом и без):
 *   стоящее тело — толчок скользит по подшагам (SolidGuard.stepBody); считаются кадры, где тело оказалось ВНУТРИ твёрдого;
 *   кукла (Ragdoll) — брошена, лежит, засыпает; считаются проникновения шара > 0,12 м, «под полом», «не уснула»;
 *   лежащее тело — lieProbe: на кровати лежит НА ней, у шкафа выталкивается.
 * Пороги только ужесточать (в тестах — tests/unit/solid-guard*.test.js).
 */
import { stepBody, standFree, bounce, lieProbe } from '../src/game/SolidGuard.js';
import { Ragdoll, DOLL } from '../src/game/Ragdoll.js';
import { house, rng, FLOOR } from '../tests/unit/solid-guard-world.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const N = +(args[args.indexOf('--n') + 1]) || 200;
const BODIES = { житель: 0.45, рыцарь: 0.58, зомби: 0.88, корова: 0.6, свинья: 0.5, тарон: 1.6 };

let fails = 0;
const report = (name, bad, total, extra = '') => { console.log(`${bad === 0 ? 'ok  ' : 'FAIL'} ${name}: ${bad} из ${total} ${extra}`); if (bad) fails++; };

for (const door of [false, true]) {
    const H = house({ door }), { world } = H, r = rng(door ? 21 : 9);
    // 1) the standing body
    for (const [kind, R] of Object.entries(BODIES)) {
        let bad = 0, frames = 0, bounced = 0;
        for (let n = 0; n < N; n++) {
            const p = { x: 0, z: 0 };
            let tries = 0;
            do { p.x = 1 + r() * 11; p.z = 1 + r() * 9; } while (!standFree(world, p.x, p.z, R, FLOOR) && ++tries < 200);
            if (tries >= 200) continue;
            const sp = 10 + r() * 50, a = r() * Math.PI * 2, v = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp };
            const got = { x: 0, z: 0 }, want = { x: 0, z: 0 };
            for (let f = 0; f < 60; f++) {
                want.x = v.vx / 30; want.z = v.vz / 30;
                stepBody(world, p, want.x, want.z, R, FLOOR, got);
                if (bounce(v, want, got)) bounced++;
                v.vx *= 0.8; v.vz *= 0.8; frames++;
                if (!standFree(world, p.x, p.z, R, FLOOR) && !(door && p.z > 10)) bad++;
            }
        }
        report(`стоящее тело «${kind}» r=${R}${door ? ' (дверь)' : ''}`, bad, frames, `(ударов о твёрдое: ${bounced})`);
    }
    // 2) the rag doll
    let pen = 0, under = 0, awake = 0, total = 0, worst = 0;
    for (let n = 0; n < N / 2; n++) {
        const d = new Ragdoll();
        let x, z;
        do { x = 1.5 + r() * 9; z = 1.5 + r() * 7; } while (!standFree(world, x, z, 0.5, FLOOR) || (x > 3.3 && x < 7.7 && z > 3.3 && z < 6.7));
        let a = r() * Math.PI * 2;
        const sp = 10 + r() * 50;
        if (r() < 0.5) d.stand(x, FLOOR, z, Math.cos(a), Math.sin(a), Math.cos(a) * sp, 2 + r() * 8, Math.sin(a) * sp, (r() - 0.5) * 6);
        else {
            // (a body that fell lying starts clear of everything: it was lying there already)
            let q = 0;
            for (; q < 100; q++) {
                const pr = lieProbe(world, x, z, Math.cos(a), Math.sin(a), FLOOR);
                if (pr.hit === 0 && pr.rest === 0 && x + Math.cos(a) * 4.2 > 1.2 && x + Math.cos(a) * 4.2 < 10.8 && z + Math.sin(a) * 4.2 > 1.2 && z + Math.sin(a) * 4.2 < 8.8) break;
                x = 1.5 + r() * 9; z = 1.5 + r() * 7; a = r() * Math.PI * 2;
            }
            if (q >= 100) continue;
            d.lie(x, FLOOR, z, Math.cos(a), Math.sin(a));
            if (d.penetration(world) > 0.05) continue; // (laid down partly in something: not a body that fell there)
        }
        let t = 0;
        while (t < 8 && !d.asleep) { d.step(world, 1 / 60); t += 1 / 60; const p = d.penetration(world); worst = Math.max(worst, p); if (p > 0.12 && !(door && d.at(0)[2] > 10)) pen++; }
        total++;
        if (d.lowest() < FLOOR - 0.12) under++;
        if (!d.asleep) awake++;
    }
    report(`кукла: проникновения >0,12 м${door ? ' (дверь)' : ''}`, pen, total, `(худшее ${worst.toFixed(2)} м)`);
    report(`кукла: ниже пола`, under, total);
    report(`кукла: не уснула за 8 с`, awake, total);
    // 3) lying
    const on = { ...lieProbe(world, 2.25, 1.5, 0, 1, FLOOR) }, cup = { ...lieProbe(world, 8.2, 3, 1, 0, FLOOR) };
    report('лежит НА кровати', Math.abs(on.rest - 1.0) < 1e-9 && on.hit === 0 ? 0 : 1, 1);
    report('у шкафа выталкивается', cup.hit > 0 && cup.pushX < -0.5 ? 0 : 1, 1);
    void DOLL;
}
console.log(fails ? `\n${fails} замеров не прошли` : '\nвсе замеры чистые: 0 проникновений');
if (check && fails) process.exit(1);
