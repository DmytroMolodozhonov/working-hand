#!/usr/bin/env node
/**
 * ragdoll-screenshots — the rag doll in the REAL game (Creative, the nearest castle): a villager is put by a wall and thrown at it by
 * «Джолт» (the spell's own push through CreatureImpact), then one is killed beside it; pictures of the flight and of how they lie.
 *   node tools/ragdoll-screenshots.mjs [--out docs/media] [--port 8213]
 * Pictures: ragdoll-jolt-1.png (in the air), ragdoll-jolt-2.png (against the wall), ragdoll-dead.png (killed, lying as he fell).
 * Numbers to the console: how deep any drawn part went into a block (must be ~0), whether the dolls fell asleep.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const PORT = Number(arg('--port', 8213));
fs.mkdirSync(out, { recursive: true });

// (the game's server; asked with node's own http — not fetch)
const srv = spawn('python3', ['server.py', '--no-browser'], { env: { ...process.env, ZNS_PORT: String(PORT), ZNS_NO_BROWSER: '1', ZNS_NO_PIP: '1' }, stdio: 'ignore' });
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/' }, (q) => { q.resume(); res(q.statusCode === 200); }); r.on('error', () => res(false)); });
for (let i = 0; i < 200 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150));

const browser = await launch({});
try {
    const { page } = await openPage(browser, `http://localhost:${PORT}/`, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative').catch(async (e) => { if (!/Timeout/.test(e.message)) throw e; await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 600000 }); });
    await waitHudVisible(page, 240000);
    const setup = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
        for (let i = 0; i < 600; i++) { const cs = g.castleLife.castles.get(c.id); if (cs && [...cs.active.values()].filter((v) => !v.dead && !v.seated).length >= 3) break; await sleep(100); }
        await sleep(1500);
        const cs = g.castleLife.castles.get(c.id);
        return { castle: c.id, people: cs ? cs.active.size : 0 };
    });
    console.log(JSON.stringify(setup));
    // a wall: walk round the gate for a spot 3.5 m from a solid column of blocks, the hero 7 m back
    const shot = async (name) => { await page.screenshot({ path: path.join(out, name + '.png') }); console.log('→', path.join(out, name + '.png')); };
    const scene = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, t = g.world.terrain.data, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const c = window.__castle, cs = g.castleLife.castles.get(c.id);
        const fy = (x, z) => g.collision.groundY(x, z);
        let spot = null;
        for (let r = 6; r < 60 && !spot; r += 2) for (let a = 0; a < Math.PI * 2 && !spot; a += 0.2) {
            const wx = Math.round(c.gate.x + Math.cos(a) * r), wz = Math.round(c.gate.z + Math.sin(a) * r);
            const gy = fy(wx + 4 * Math.cos(a), wz + 4 * Math.sin(a)), L = Math.round(gy + 1.5);
            if (!t.solidIn(wx, wz, L, L + 4)) continue;
            // the villager 3.5 m before the wall, the hero 9 m further: open ground between (no blocks at body height)
            const dx = -Math.cos(a), dz = -Math.sin(a);
            const vx = wx + dx * 3.5, vz = wz + dz * 3.5, hx = wx + dx * 12, hz = wz + dz * 12;
            let open = true;
            for (let s = 1.2; s < 12 && open; s += 0.5) { const x = wx + dx * s, z = wz + dz * s; if (Math.abs(fy(x, z) - gy) > 0.6 || t.solidIn(Math.round(x), Math.round(z), L, L + 3)) open = false; }
            if (open) spot = { wx, wz, vx, vz, hx, hz, gy, dx, dz };
        }
        if (!spot) return null;
        const v = [...cs.active.values()].find((p) => !p.dead && !p.seated && p.role !== 'king');
        v.x = spot.vx; v.z = spot.vz; v.y = spot.gy; v.path = null; v.yaw = Math.atan2(spot.dx, spot.dz); // (looking at the hero: the person looks along −Z)
        g.character.group.position.set(spot.hx, spot.gy + 2.0, spot.hz);
        const yaw = Math.atan2(-(spot.vx - spot.hx), -(spot.vz - spot.hz));
        window.__aim = { yaw };
        window.__v = v;
        const look = () => { const ch = g.character; ch.group.rotation.y = yaw; if (g.cameraCtl) { g.cameraCtl.yaw = yaw; g.cameraCtl.pitch = 0.08; } if (g.player) { g.player.yaw = yaw; g.player.pitch = 0.08; } if ('yaw' in g) g.yaw = yaw; };
        window.__look = look;
        for (let i = 0; i < 40; i++) { look(); v.x = spot.vx; v.z = spot.vz; v.stunT = 1; await sleep(50); }
        return { spot, who: v.role, id: v.id };
    });
    console.log(JSON.stringify(scene));
    if (!scene) throw new Error('no wall found by the castle');
    // «Джолт» at him: the spell's own push (CreatureImpact.spellHit from the hero), toward the wall
    await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, v = window.__v, me = g.character.group.position;
        window.__probe = { worst: 0 };
        g.creatureImpact.spellHit(v, 'Jolt', new T.Vector3(me.x, v.y + 2.6, me.z), g.localId);
        const parts = [['head', 0, 0.6, 0], ['leftArm', 0, -0.95, 0], ['rightArm', 0, -0.95, 0], ['leftKnee', 0, -0.65, 0], ['rightKnee', 0, -0.65, 0], ['pelvis', 0, 0, 0]];
        const w = new T.Vector3(), t = g.world.terrain.data;
        window.__probeT = setInterval(() => {
            window.__look();
            v.model.group.updateMatrixWorld(true);
            for (const [k, x, y, z] of parts) {
                v.model[k].localToWorld(w.set(x, y, z));
                if (t.solidIn(Math.round(w.x), Math.round(w.z), Math.round(w.y + 1), Math.round(w.y + 1))) window.__probe.worst = Math.max(window.__probe.worst, 0.5 - Math.max(Math.abs(w.x - Math.round(w.x)), Math.abs(w.z - Math.round(w.z))));
            }
        }, 16);
    });
    await page.waitForTimeout(250); await shot('ragdoll-jolt-1');
    await page.waitForTimeout(2500); await shot('ragdoll-jolt-2');
    const r1 = await page.evaluate(() => { const g = window.__zns.game, v = window.__v, e = g.creatureImpact.active.get('v|' + v.id); return { rag: !!e?.s.rag, asleep: !!e?.s.rag?.asleep, state: e?.s.state, worstInBlock: +window.__probe.worst.toFixed(3) }; });
    console.log('Jolt:', JSON.stringify(r1));
    // killed where he lies — a new one killed standing by the wall, too
    await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), v = window.__v;
        if (!v.dead) g.castleLife._die(v, g.localId);
        await sleep(4000);
    });
    await shot('ragdoll-dead');
    const r2 = await page.evaluate(() => { const g = window.__zns.game, v = window.__v; clearInterval(window.__probeT); return { dead: !!v.dead, rag: v.rag, body: [...g.death.bodies.values()].some((b) => b.who === v.id && b.rp), worstInBlock: +window.__probe.worst.toFixed(3) }; });
    console.log('dead:', JSON.stringify(r2));
} finally { await browser.close(); srv.kill(); }
