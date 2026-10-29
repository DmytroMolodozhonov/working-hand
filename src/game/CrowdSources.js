/**
 * CrowdSources.js — who is on the ground, for the crowd (Crowd.js): every kind of creature the
 * game has, with its size. A new walking creature is added here (and walks with `crowdStep`).
 */

import { choreThingsAt } from './Chores.js';
import { Crowd, steer, steerPilot, BODY_R, numId } from './Crowd.js';
import { PILOT } from './Pilot.js';

/** The game walks with Pilot.js; `false` brings the old Avoid.js-based `steer` back (for a comparison, a bisect). */
export const USE_PILOT = true;
import { wardsOf, clipStep } from './ShieldWalls.js';

/** The game's crowd (made once; filled from all the systems each frame it's asked). */
export function crowdOf(g) {
    if (g.crowd) return g.crowd;
    const c = g.crowd = new Crowd();
    c.addSource((push) => {
        // the players (me and the others by the network) — the feet, 1.95 m under the eyes
        const me = g.character?.group?.position;
        // (a player in the monster form — MonsterForm.js: ×7, the feet 14 m under the body's middle — is walked round as big as he is)
        const ms = g.character?.size || 1;
        if (me && !g.isDeadLocal) push({ x: me.x, y: me.y - 1.95 * ms, z: me.z, r: BODY_R.player * ms, ref: g.character, id: 'me', kind: 'player' });
        for (const [id, r] of g.remotes || []) {
            if (r.dead || !r.position) continue;
            const rs = r.character?.size || 1;
            push({ x: r.position.x, y: r.position.y - 1.95 * rs, z: r.position.z, r: BODY_R.player * rs, ref: r, id: String(id), kind: 'player' });
        }
        // the castle / village people, wizards, travellers
        for (const v of g.castleLife?.byId?.values?.() || []) {
            if (v.dead || v.seated || v.climb || v.group?.visible === false) continue;
            push({ x: v.x, y: v.y, z: v.z, r: v.role === 'knight' || v.role === 'king' ? BODY_R.knight : BODY_R.man, ref: v, id: v.id, kind: 'man', still: v.talking > 0 });
            // the things of a chore (a ladder, a chopping block, a washing line, a dummy — Chores.js): walked round
            const cp = choreThingsAt(v);
            if (cp) push({ x: cp.x, y: v.y, z: cp.z, r: cp.r, ref: v, id: v.id + ':p', kind: 'man', still: true, vx: 0, vz: 0 });
        }
        // the animals (a horse in a cart's harness too: it is part of the cart)
        for (const a of g.animals?.list || []) {
            if (a.dead || !a.group) continue;
            const p = a.group.position;
            push({ x: p.x, y: p.y, z: p.z, r: a.dims?.len ? Math.max(0.4, a.dims.len * 0.42) : 0.9 * (a.group.scale?.x || 1), ref: a, id: a.id, kind: 'animal' });
        }
        for (const z of g.zombies || []) {
            if (z.isDead || !z.group) continue;
            const p = z.group.position;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.zombie, ref: z, id: z.id, kind: 'zombie' });
        }
        for (const s of g.spiders?.list || []) {
            if (s.dead || !s.model) continue;
            const p = s.model.position;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.spider, ref: s, id: s.id, kind: 'spider' });
        }
        // living trees and risen skeletons (only the ones that walk; a tree standing is the world's)
        // plant creatures: a telewilpin is a thicket to walk round; a carnivorous head is given a wide berth (its tendrils reach ~6 m)
        for (const p of g.plants?.near || []) {
            if (p.dead) continue;
            push({ x: p.x, y: p.y, z: p.z, r: p.kind === 'carnivore' ? 4.5 : p.kind === 'brightflower' ? 1.8 : 1.1, ref: p, id: p.id, kind: 'plant', still: true, vx: 0, vz: 0 });
        }
        for (const t of g.livingTrees?.list || []) {
            if (!t.alive || !t.model) continue;
            const p = t.model.position, s = t.model.userData?.s || 1;
            push({ x: p.x, y: p.y, z: p.z, r: t.skel ? BODY_R.skeleton : BODY_R.tree * s, ref: t, id: t.id, kind: t.skel ? 'skeleton' : 'tree' }); // (a skeleton: a man's size)
        }
        // dragons on their feet (flying ones are above everybody)
        for (const d of g.dragons?.list || []) {
            if (d.dead || !d.model || d.mode === 'air') continue;
            const p = d.model.position;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.dragon * (d.size || 1) / 1.25, ref: d, id: d.id, kind: 'dragon' });
        }
        // the Ice Castle's queen, snowmen and ice monsters, and the friendly snowmen of «Snowman» (IceQueen.js)
        for (const c of g.iceCastle?.list || []) {
            if (c.dead || !c.model) continue;
            const p = c.model.position;
            push({ x: p.x, y: p.y, z: p.z, r: c.r, ref: c, id: c.id, kind: c.type === 'snowman' || c.type === 'friend' ? 'snowman' : c.type === 'monster' ? 'iceMonster' : 'iceQueen' }); // (the friendly snowman of «Snowman» too)
        }
        // owls sitting on the ground (Owls.js; a flying one is above everybody)
        for (const o of g.owls?.list || []) {
            if (o.dead || !o.model) continue;
            const p = o.model.position;
            if (p.y - (g.collision?.groundY?.(p.x, p.z) ?? p.y) > 0.5) continue;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.owl, ref: o, id: o.id, kind: 'owl' });
        }
        // the swamp Canaries (Canaries.js): round each other and the walkers (the throwers keep their camp's places)
        for (const c of g.canaries?.list || []) {
            if (c.dead || !c.model) continue;
            const p = c.model.position;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.canary, ref: c, id: c.id, kind: 'canary' });
        }
        // creatures of one's own («Да пусть создастся»: CustomCreatures.js) on the ground (a flying one is above everybody), as big as each is
        for (const c of g.customCreatures?.list || []) {
            if (c.dead || c.born < 1 || c.flying) continue;
            const p = c.model.position;
            push({ x: p.x, y: p.y, z: p.z, r: c.r, ref: c, id: c.id, kind: 'custom' });
        }
        // infernal gargoyles flying low (a hunt at the people's height: nobody walks through one — Gargoyles.js; high up they are above everybody)
        for (const o of g.gargoyles?.list || []) {
            if (o.dead || !o.model) continue;
            const p = o.model.position;
            if (p.y - (g.collision?.groundY?.(p.x, p.z) ?? p.y) > 5.5) continue;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.gargoyle, ref: o, id: o.id, kind: 'gargoyle' });
        }
        // the players' «Protection» (the hand shield, the dome — the gods' too): solid, a wall for all (ShieldWalls.js)
        for (const w of wardsOf(g)) push({ x: w.x, y: w.y, z: w.z, r: w.r, ref: w, id: 'ward:' + w.owner, kind: 'ward', still: true, vx: 0, vz: 0 });
        // carts on the roads
        for (const k of g.carriages?.list?.values?.() || []) {
            if (k.gone || !Number.isFinite(k.x)) continue;
            // (long: two round bodies, the front and the back of the box; its horses are animals above)
            const sx = -Math.sin(k.yaw || 0), sz = -Math.cos(k.yaw || 0), v = k.spd || 0;
            for (const o of [-1.6, 1.6]) push({ x: k.x + sx * o, y: k.y ?? 0, z: k.z + sz * o, r: BODY_R.carriage, ref: k, id: k.id, kind: 'carriage', vx: sx * v, vz: sz * v });
        }
    });
    return c;
}

/** The bodies near (x, y, z) within `range` m, without `self` (this frame's grid). */
export function crowdNear(g, x, y, z, range, self, dy = 2.5, out) {
    const c = crowdOf(g);
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    // (once a frame; a game without frames — a test's — every time it's asked)
    c.update(g.frameCount ?? now, now);
    return c.near(x, z, y, range, self, dy, out);
}

const _near = [];

/**
 * The way a walker steps now, round everybody near it. `me` is the creature (its memory `me._avoid`),
 * p its feet {x, y, z}, (ux, uz) the unit way to its goal, d m to it.
 * opts: {r, speed, dt, room(x, z), look, id, skip(body) → not to be gone round (kept off another way)}. → {x, z} or null (stand this step).
 */
export function crowdStep(g, me, p, ux, uz, d, opts = {}) {
    const r = opts.r ?? 0.55;
    const pilotOn = USE_PILOT && !opts.legacy;
    const range = pilotOn ? PILOT.LOCK_RANGE + 1 : Math.max(4, (opts.look ?? 2.6) + 2 * r + 3);
    let others = crowdNear(g, p.x, p.y ?? 0, p.z, range, me, opts.dy ?? 2.5, _near);
    if (opts.skip) others = others.filter((b) => !opts.skip(b));
    const st = me._avoid || (me._avoid = {});
    let a;
    if (pilotOn) {
        // (what the others' own pilots say: who is backing out, how deep in a narrow place each is, their rank)
        for (const b of others) { const q = b.ref?._avoid?.pilot; if (q) { b.pilot = q; b.rank = q.rank || 0; } }
        a = steerPilot(st, p, { x: ux, z: uz }, { ...opts, others, r, maxF: d, id: numId(opts.id ?? me.id) ?? 0, clock: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 });
    } else a = steer(st, p, { x: ux, z: uz }, { ...opts, others, r, maxF: d, id: numId(opts.id ?? me.id) ?? 0 });
    // (a player's shield / dome: never through it — along it, or it stands at it: ShieldWalls.js)
    if (!a || a.unstick) return a;
    const w = wardsOf(g);
    if (!w.length) return a;
    const c = clipStep(p, a.x, a.z, r, d, w);
    if (!c) return null;
    if (c.x !== a.x || c.z !== a.z) return { ...a, x: c.x, z: c.z, ward: true };
    return a;
}

/**
 * Is somebody already standing where a new creature is about to appear (x, z, radius r)? Returns that body or null —
 * a spawner waits for another try instead of putting two creatures in one place (the Creative dragon on the queen).
 */
export function spotTaken(g, x, z, r, self = null) {
    const c = crowdOf(g), bodies = [];
    for (const src of c.sources) { try { src((b) => { if (b && Number.isFinite(b.x) && Number.isFinite(b.z)) bodies.push(b); }); } catch { /* a source mid-teardown */ } }
    for (const b of bodies) {
        if (self && (b.ref === self || b.id === self.id)) continue;
        if (Math.hypot(b.x - x, b.z - z) < r + (b.r ?? BODY_R.man)) return b;
    }
    return null;
}
