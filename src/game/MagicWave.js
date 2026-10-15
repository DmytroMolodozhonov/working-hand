/**
 * MagicWave.js — what the two great waves share: «Circle Attack» (CircleAttack.js) and the
 * blast of «Inspirius» (Inspirius.js). A wave rolls outwards from a point and reaches each
 * body when its front gets to it — not all at once:
 *
 *   - every creature it reaches (eachBody — ALL of them: zombies, castle people, animals,
 *     sailors, the spider, dragons, phoenixes, living trees, book-birds) is hurt by its own
 *     rules (hitBody) and thrown off its feet outwards — the closer, the further it flies
 *     (CreatureImpact; a dragon only sways, the spider is too heavy to fly);
 *   - the ground comes down band after band behind the front (ruinBand: Ruin.js «ring») —
 *     every computer brings down the same blocks; saves and late joiners replay the bands.
 *
 * Who decides: the host hurts and pushes the creatures; every computer hurts its own player.
 */

import * as THREE from 'three';
import { keepIn } from './HouseWards.js';
import { isCastleBlock } from '../world/Terrain.js';
import { dragonCenter } from './Dragons.js';
import { phoenixCenter } from './Phoenixes.js';

/**
 * Every creature there is, as fn(kind, creature, position) — kind: 'zombie', 'villager',
 * 'animal', 'sailor', 'spider', 'dragon', 'phoenix', 'tree', 'book'.
 */
export function eachBody(g, fn) {
    for (const z of g.zombies || []) if (!z.isDead && z.group) fn('zombie', z, z.group.position);
    for (const v of g.castleLife?.byId?.values() || []) if (!v.dead) fn('villager', v, new THREE.Vector3(v.x, v.y + 1.2, v.z));
    for (const a of g.animals?.list || []) if (!a.dead && a.group) fn('animal', a, a.group.position);
    for (const s of g.ships?.crew?.byId?.values() || []) if (!s.dead) fn('sailor', s, new THREE.Vector3(s.x, s.y + 1.2, s.z));
    for (const s of g.spiders?.list || []) if (!s.dead && s.model) fn('spider', s, s.model.position);
    for (const d of g.dragons?.list || []) if (!d.dead) fn('dragon', d, dragonCenter(d));
    for (const f of g.phoenixes?.list || []) if (!f.dead && f.group) fn('phoenix', f, phoenixCenter(f));
    for (const t of g.livingTrees?.list || []) if (!t.isDead && t.model) fn('tree', t, t.model.position);
    for (const b of g.books?.birds?.values() || []) if (b.state !== 'fall' && b.model) fn('book', b, b.model.position);
}

/**
 * (host) One creature takes `dmg` from the wave of `spell` (its own rules: a dragon by
 * DragonKinds.ON_DRAGON, a phoenix by Phoenixes.TARGETS). `treeKind`: what a living tree
 * takes it as (LivingTrees.aliveDamage: fire, lightning and the mightiest spells break one).
 */
export function hitBody(g, kind, c, pos, dmg, dir, spell, by, treeKind = null) {
    const who = by === g.localId ? null : by;
    switch (kind) {
        case 'zombie': g.damageZombie?.(c, dmg, false, dir, who); break;
        case 'villager': g.castleLife?.hit(c, dmg, dir.clone(), by, { spell: true }); break;
        case 'animal': g.animals?.hit(c, dmg, dir.clone(), by); break;
        case 'sailor': g.ships?.crew?.hit(c, dmg, dir.clone(), by, { spell: true }); break;
        case 'spider': g.spiders?.hit(c, dmg, spell, by); break;
        case 'dragon': g.dragons?.hit(c, dmg, spell, by); break;
        case 'phoenix': g.phoenixes?.hit(c, dmg, spell, by); break;
        case 'tree': if (treeKind) g.livingTrees?.hit(c, dmg, treeKind, by); break;
        case 'book': g.books?.hitAt(pos, 0.3, by, null); break;
        default: break;
    }
}

/**
 * (host) The wave throws a creature outwards: `v` along the ground, `toss` up. A dragon
 * only sways (Dragons.push), the spider stands (too heavy), a book-bird is knocked down by
 * hitBody; the rest fly (CreatureImpact).
 */
export function throwBody(g, kind, c, v, toss, spell, by, from) {
    if (kind === 'spider' || kind === 'book') return;
    if (kind === 'dragon') { g.dragons?.push?.(spell, by, (_p, d) => (d === c ? v : null), { from }); return; }
    g.creatureImpact?.apply(c, { v: v.clone(), by, spell, jolt: 4, from, always: { down: 3 }, down: 3, toss, fly: true });
}

/**
 * One band of the ground comes down (between the circles `r0` and `r1` round `p`; `full`
 * the whole circle). Every computer does it the same way (Ruin.js is deterministic).
 * @returns the Ruin.js result
 */
export function ruinBand(g, p, r0, r1, full, by, kind = 'ruin') {
    if (!g.world?.destructible || !g.world.terrain) return null;
    const keep = g.wards?.keepFor(p, r1) || []; // (a house's sphere of protection holds what is inside)
    const out = g.world.ruin(p, r1, keepIn(keep), { inner: r0, full });
    g.explosions?.push({ p: [p.x, p.y, p.z], r: r1, ruin: 1, ri: r0, rf: full, ...(keep.length ? { k: keep } : {}) }); // (saves, late joiners)
    for (const f of out.falls || []) g.falling?.add(f);
    g.wreck?.afterBlast?.(p, r1, 99);
    if (g.authority) {
        let wrecked = 0;
        for (const b of out.removed || []) if (isCastleBlock(b[3])) wrecked++;
        if (wrecked) g.castleLife?.damaged(p, by, wrecked, true, { r: r1, kind });
    }
    // the blocks are seen falling (Total Destruction's falling blocks: the same look)
    const D = g.destruction;
    if (D && (out.removed?.length || out.rubble?.length)) {
        const d = { p: p.clone(), by, R: r1, t: 0, collapsed: true, crash: 3, done: false, mine: false, band: true };
        D._startFall(d, out);
        D.list.push(d);
    }
    if (out.props?.length) g.fx?.debrisFrom(out.props, p, 60);
    return out;
}
