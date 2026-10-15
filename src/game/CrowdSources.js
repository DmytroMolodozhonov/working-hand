/**
 * CrowdSources.js — who is on the ground, for the crowd (Crowd.js): every kind of creature the
 * game has, with its size. A new walking creature is added here (and walks with `crowdStep`).
 */

import { Crowd, steer, BODY_R, numId } from './Crowd.js';

/** The game's crowd (made once; filled from all the systems each frame it's asked). */
export function crowdOf(g) {
    if (g.crowd) return g.crowd;
    const c = g.crowd = new Crowd();
    c.addSource((push) => {
        // the players (me and the others by the network) — the feet, 1.95 m under the eyes
        const me = g.character?.group?.position;
        if (me && !g.isDeadLocal) push({ x: me.x, y: me.y - 1.95, z: me.z, r: BODY_R.player, ref: g.character, id: 'me', kind: 'player' });
        for (const [id, r] of g.remotes || []) if (!r.dead && r.position) push({ x: r.position.x, y: r.position.y - 1.95, z: r.position.z, r: BODY_R.player, ref: r, id: String(id), kind: 'player' });
        // the castle / village people, wizards, travellers
        for (const v of g.castleLife?.byId?.values?.() || []) {
            if (v.dead || v.seated || v.climb || v.group?.visible === false) continue;
            push({ x: v.x, y: v.y, z: v.z, r: v.role === 'knight' || v.role === 'king' ? BODY_R.knight : BODY_R.man, ref: v, id: v.id, kind: 'man', still: v.talking > 0 });
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
        for (const t of g.livingTrees?.list || []) {
            if (!t.alive || !t.model) continue;
            const p = t.model.position, s = t.model.userData?.s || 1;
            push({ x: p.x, y: p.y, z: p.z, r: (t.skel ? BODY_R.skeleton : BODY_R.tree) * s, ref: t, id: t.id, kind: t.skel ? 'skeleton' : 'tree' });
        }
        // dragons on their feet (flying ones are above everybody)
        for (const d of g.dragons?.list || []) {
            if (d.dead || !d.model || d.mode === 'air') continue;
            const p = d.model.position;
            push({ x: p.x, y: p.y, z: p.z, r: BODY_R.dragon * (d.size || 1) / 1.25, ref: d, id: d.id, kind: 'dragon' });
        }
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
    const range = Math.max(4, (opts.look ?? 2.6) + 2 * r + 3);
    let others = crowdNear(g, p.x, p.y ?? 0, p.z, range, me, opts.dy ?? 2.5, _near);
    if (opts.skip) others = others.filter((b) => !opts.skip(b));
    const st = me._avoid || (me._avoid = {});
    return steer(st, p, { x: ux, z: uz }, { ...opts, others, r, maxF: d, id: numId(opts.id ?? me.id) ?? 0 });
}
