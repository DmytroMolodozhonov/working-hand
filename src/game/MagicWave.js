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

import { breaking } from '../world/EnchantedStone.js';
import * as THREE from 'three';
import { keepIn } from './HouseWards.js';
import { isCastleBlock } from '../world/Terrain.js';
import { dragonCenter } from './Dragons.js';
import { phoenixCenter } from './Phoenixes.js';
import { owlCenter } from './Owls.js';
import { spencerCenter } from './SpencerBirds.js';
import { gargoyleCenter } from './GargoyleModel.js';

/**
 * Every creature there is, as fn(kind, creature, position) — kind: 'zombie', 'villager',
 * 'animal', 'sailor', 'spider', 'dragon', 'phoenix', 'owl', 'gargoyle', 'tree', 'book'.
 */
export function eachBody(g, fn) {
    for (const z of g.zombies || []) if (!z.isDead && z.group) fn('zombie', z, z.group.position);
    for (const v of g.castleLife?.byId?.values() || []) if (!v.dead) fn('villager', v, new THREE.Vector3(v.x, v.y + 1.2, v.z));
    for (const a of g.animals?.list || []) if (!a.dead && a.group) fn('animal', a, a.group.position);
    for (const s of g.ships?.crew?.byId?.values() || []) if (!s.dead) fn('sailor', s, new THREE.Vector3(s.x, s.y + 1.2, s.z));
    for (const s of g.spiders?.list || []) if (!s.dead && s.model) fn('spider', s, s.model.position);
    for (const d of g.dragons?.list || []) if (!d.dead) fn('dragon', d, dragonCenter(d));
    for (const f of g.phoenixes?.list || []) if (!f.dead && f.group) fn('phoenix', f, phoenixCenter(f));
    for (const o of g.owls?.list || []) if (!o.dead && o.group) fn('owl', o, owlCenter(o));
    for (const c of g.customCreatures?.list || []) if (!c.dead && c.born >= 1) fn('custom', c, g.customCreatures.centre(c)); // (creatures of one's own — CustomCreatures.TARGETS)
    for (const c of g.canaries?.list || []) if (!c.dead && c.model) fn('canary', c, new THREE.Vector3(c.model.position.x, c.model.position.y + 1.2, c.model.position.z)); // (the swamp Canaries: Canaries.hit)
    for (const c of g.tarons?.list || []) if (!c.dead && c.model) fn('taron', c, new THREE.Vector3(c.model.position.x, c.model.position.y + 3, c.model.position.z)); // (the Tarons: Taron.hit)
    for (const o of g.spencers?.list || []) if (!o.dead && o.group) fn('spencer', o, spencerCenter(o)); // (the invisible bird: the wave kills it)
    for (const o of g.ghosts?.targets?.() || []) fn('ghost', o, new THREE.Vector3(o.position.x, o.position.y + 1.7, o.position.z)); // (the ghosts of the Castle of Ghosts: Circle Attack / Inspirius frighten them, the gods' spells scatter them — GhostRules)
    for (const o of g.gargoyles?.list || []) if (!o.dead && o.group && o.mode !== 'crumble') fn('gargoyle', o, gargoyleCenter(o));
    for (const o of g.diabolos?.list || []) fn('diabolos', o, g.diabolos._centre(new THREE.Vector3())); // (Дьяволос: волна его только злит — DEVIL_VS) // (the infernal gargoyles: GargoyleRules.TARGETS)
    for (const t of g.livingTrees?.list || []) if (!t.isDead && t.model) fn('tree', t, t.model.position);
    for (const b of g.books?.birds?.values() || []) if (b.state !== 'fall' && b.model) fn('book', b, b.model.position);
    for (const c of g.iceCastle?.list || []) if (!c.dead && c.model) fn('ice', c, c.model.position); // (the Ice Castle: IceQueen.iceDamage)
    for (const p of g.plants?.near || []) if (!p.dead) fn('plant', p, new THREE.Vector3(p.x, p.y + 2, p.z)); // (telewilpins, carnivorous heads: PlantLife.plantDamage)
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
        case 'sailor': g.ships?.crew?.hit(c, dmg, dir.clone(), by, { spell: true, kind: spell }); break;
        case 'spider': g.spiders?.hit(c, dmg, spell, by); break;
        case 'dragon': g.dragons?.hit(c, dmg, spell, by); break;
        case 'phoenix': g.phoenixes?.hit(c, dmg, spell, by); break;
        case 'gargoyle': g.gargoyles?.hit(c, dmg, spell, by); break;
        case 'diabolos': g.diabolos?.hit(c, dmg, spell, by); break; // (бессмертен: «Инспириус», «Бум», «Круговая атака» — только злят) // (stone: Inspirius / Boom — the gods' — shatter it; Circle Attack hurts and shoves)
        case 'canary': g.canaries?.hit(c, dmg, spell, by); break;
        case 'taron': g.tarons?.hit(c, dmg, spell, by); break;
        case 'spencer': g.spencers?.hit(c, dmg, spell, by); break;
        case 'ghost': g.ghosts?.hit(c, dmg, spell, by); break; // (never hurt: GhostRules.ghostSpell — scared / scattered / nothing)
        case 'custom': g.customCreatures?.hit(c, dmg, spell, by); break; // (a creature of one's own: its own immunities — CustomCreatures.hit) // (a canary: the wave hurts it; the camp turns on the caster)
        case 'owl': g.owls?.hit(c, dmg, spell, by); break; // (Inspirius — a scroll's — kills it; Circle Attack it darts away from: Owls.TARGETS)
        case 'tree': if (treeKind) g.livingTrees?.hit(c, dmg, treeKind, by); break;
        case 'book': g.books?.hitAt(pos, 0.3, by, null); break;
        case 'ice': g.iceCastle?.hit(c, dmg, spell, by); break;
        case 'plant': g.plants?.hit(c, dmg, spell, by); break;
        default: break;
    }
}

/**
 * (host) The wave throws a creature outwards: `v` along the ground, `toss` up. A dragon
 * only sways (Dragons.push), the spider stands (too heavy), a book-bird is knocked down by
 * hitBody; the rest fly (CreatureImpact).
 */
export function throwBody(g, kind, c, v, toss, spell, by, from) {
    if (kind === 'spider' || kind === 'book' || kind === 'plant' || kind === 'ghost') return; // (a ghost is not thrown: it has no body) // (rooted plants are not thrown)
    if (kind === 'ice') { g.iceCastle?.push(spell, by, (_p, x) => (x === c ? v : null)); return; }
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
    // (the enchanted stone: only «Инспириус» breaks it, near its middle; «Circle Attack» never — EnchantedStone.js)
    const en = kind === 'inspirius' ? 'Inspirius' : null;
    const out = breaking(en && g.world.terrain?.data, en, p.x, p.z, () => g.world.ruin(p, r1, keepIn(keep), { inner: r0, full }));
    g.explosions?.push({ p: [p.x, p.y, p.z], r: r1, ruin: 1, ri: r0, rf: full, ...(en ? { en } : {}), ...(keep.length ? { k: keep } : {}) }); // (saves, late joiners)
    for (const f of out.falls || []) g.falling?.add(f);
    g.wreck?.afterBlast?.(p, r1, 99, kind !== 'inspirius'); // (the forged-iron gates of a keep: only «Инспириус» tears them off — «Circle Attack» only rings on them; Alohomora.IRON_GATE_VS)
    if (g.authority) {
        let wrecked = 0;
        for (const b of out.removed || []) if (isCastleBlock(b[3])) wrecked++;
        if (wrecked) g.castleLife?.damaged(p, by, wrecked, true, { r: r1, kind });
    }
    // the blocks are seen falling (Total Destruction's falling blocks: the same look)
    const D = g.destruction;
    if (D && (out.removed?.length || out.rubble?.length)) {
        const d = { p: p.clone(), by, R: r1, t: 0, collapsed: true, crash: 3, done: false, mine: false, band: true, maxBlocks: 700 }; // (a band: fewer blocks, no shadows)
        D._startFall(d, out);
        D.list.push(d);
    }
    if (out.props?.length) g.fx?.debrisFrom(out.props, p, 60);
    return out;
}
