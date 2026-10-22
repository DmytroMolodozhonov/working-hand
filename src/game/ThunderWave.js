// «Thunderwave»: ONE zone for everything — the damage, the shove and the bolts that show who was struck (CLAUDE.md:
// «на кого и на что»). The fan: up to 4 m round-and-ahead, up to 40 m in a cone ~70° to each side of the hand's direction.
// The author: «Заклинание очень сильное — 40 маны за раз. Урон — 10 всем в зоне… чем больше существ, тем больше снимет ХП
// совокупно — выгодно, когда существ много». The blow comes from ABOVE: an ordinary «Protection» and ordinary armour
// do not stop it (the magic ones do — Combat.hitBySpell, ArmorTypes.soakBlow, CastleLife.hit, Sailors.hit).

import * as THREE from 'three';

export const THUNDER = {
    COST: 40, // mana a cast
    DAMAGE: 10, // to everyone in the zone
    RANGE: 40, // m (the cone)
    NEAR: 4, // m (round-and-ahead)
    CONE: 1.2, // rad to each side of the direction
    KIND: 'Thunderwave',
};

/** What it does to whom (one line each; «не действует» is a decision too). */
export const THUNDER_TARGETS = {
    players: 'every player in the zone, me and over the net: −10 (PLAYER_DAMAGE); an ordinary Protection and a shield in the hand do NOT stop it (the blow is from above), Protection Maxima and the gods\' shield do',
    zombies: '−10',
    castlePeople: '−10 to villagers, knights, the king, wizards, merchants, servants; their ordinary armour does not soak it, a magic piece does; a wizard\'s hand shield does not stop it, the Master\'s dome does',
    animals: '−10 and thrown back',
    sailors: '−10; a black ship\'s skeleton by Sailors.pirateBoneDamage (the kind is passed); the black ship itself is not hurt (Ships.isCursed)',
    spider: '−10', dragons: '−10 (DragonKinds.ON_DRAGON)', phoenixes: '−10 (Phoenixes.TARGETS)', owls: '−10 (a scroll\'s spell hurts it — Owls.TARGETS)',
    livingTrees: '−10 (thunder is like lightning: MIGHTY_ON_TREES)', bookBirds: 'knocked down',
    iceCastle: '−10 to the queen, her monsters and every snowman (a scroll spell: IceQueen.iceDamage)',
    world: 'glass breaks, carts are chipped (the ray of the old fan: Game.birdRay); walls and mountains stop it',
};

const COS = Math.cos(THUNDER.CONE);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** Is the point (x, y, z) in the fan of `o` along the unit direction `d`? */
export function inThunderZone(o, d, x, y, z) {
    const tx = x - o.x, ty = y - o.y, tz = z - o.z;
    const dist = Math.hypot(tx, ty, tz);
    if (dist < 1e-6) return true;
    const dot = (tx * d.x + ty * d.y + tz * d.z) / dist;
    return (dist < THUNDER.NEAR && dot > -0.2) || (dist < THUNDER.RANGE && dot > COS);
}

/**
 * The creatures (but players and zombies: SpellManager) the fan reaches, on every computer; `deal` (the host):
 * they are hurt and shoved too. A creature is in the zone if some point of its body is in the fan and nothing solid
 * (a wall, a mountain, a house's sphere) is between it and the hand. → [{x, y, z}] where the bolts strike.
 */
export function thunderZone(game, o, d, casterId, deal) {
    const hits = [];
    const duel = game.duel;
    if (!duel) return hits;
    const skip = casterId === 'local' ? game.localId : casterId;
    const bodies = duel._bodies(skip);
    for (const b of bodies) {
        if (b.kind === 'p' || b.kind === 'z') continue;
        let at = null;
        for (const k of [0.5, 0, 1]) {
            const x = b.a.x + (b.b.x - b.a.x) * k, y = b.a.y + (b.b.y - b.a.y) * k, z = b.a.z + (b.b.z - b.a.z) * k;
            if (!inThunderZone(o, d, x, y, z)) continue;
            const p = { x, y, z };
            if (!clearWay(game, o, p)) continue;
            at = p;
            break;
        }
        if (!at) continue;
        hits.push(at);
        if (deal) strike(game, b.kind, b.id, at, o, skip);
    }
    return hits;
}

/** Nothing solid between the hand and the point (CLAUDE.md: spells do not go through walls). */
export function clearWay(game, from, to) {
    if (game.wards?.shields(from, to)) return false;
    return !game.duel || game.duel._wallOnWay(_a.set(from.x, from.y, from.z), _b.set(to.x, to.y, to.z)) >= 2;
}

function strike(game, kind, id, at, o, by) {
    const dmg = THUNDER.DAMAGE, K = THUNDER.KIND;
    let dx = at.x - o.x, dz = at.z - o.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const v3 = new THREE.Vector3(dx, 0, dz);
    switch (kind) {
        case 'a': { const a = game.animals?.byId.get(id); if (!a) break; game.animals.hit(a, dmg, v3.clone(), by); if (!a.dead) game.animals.push(a, v3.clone().multiplyScalar(16).setY(6), 2.2); break; }
        case 'v': { const v = game.castleLife?.byId.get(id); if (v) game.castleLife.hit(v, dmg, v3.clone(), by, { spell: true, kind: K }); break; }
        case 'c': { const v = game.ships?.crew.byId.get(id); if (v) game.ships.crew.hit(v, dmg, v3.clone(), by, { spell: true, kind: K }); break; }
        case 't': { const t = game.livingTrees?.byId.get(id); if (t) game.livingTrees.hit(t, dmg, K, by); break; }
        case 'b': { const b = game.books?.birds?.get(id); if (b) game.books.hitBird(b, 2, K); break; }
        case 's': { const s = game.spiders?.byId(id); if (s) game.spiders.hit(s, dmg, K, by); break; }
        case 'D': { const d = game.dragons?.byId(id); if (d) { game.dragons.hit(d, dmg, K, by); game.dragons.noise?.(o); } break; }
        case 'f': { const f = game.phoenixes?.byId(id); if (f) game.phoenixes.hit(f, dmg, K, by); break; }
        case 'o': { const w = game.owls?.byId(id); if (w) game.owls.hit(w, dmg, K, by); break; }
        case 'I': { const c = game.iceCastle?.byId(id); if (c) game.iceCastle.hit(c, dmg, K, by); break; }
        default: break;
    }
}
