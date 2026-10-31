/**
 * DivineSword.js — «Божественный меч» (the gods' sword): the shared API (rules + `makeDivineSword`; THREE only for a vector).
 *
 * The secret of the game (CLAUDE.md, the author's words): the only way to destroy Diabolos is a rite — the pentagram of united power
 * (`Pentagranium Unitas`) with the Ice Queen's rod and a plain classic sword in its circle. The two wind up in a white-gold spiral and
 * become ONE new thing: the divine sword. Nowhere in the lore, the codex or a scroll is it said how to make it.
 *
 * In the game it is a real weapon of the weapon system (`Weapon` type `'divine'`, held like a sword — SwordGrip, chops, stabs, cuts off
 * limbs, breaks blocks like a sword); in a cell it is `{kind: 'weapon', type: 'divine', godGift: true}`. A gift of the gods: no spell, fire,
 * lava, ice, «Liquidation», the owner's death… destroys it (`ItemTypes.isGodGift`), but Levitation lifts and throws it.
 *
 * Contract with Diabolos (Diabolos.js, another session): the sword only asks — `game.diabolos.bladeHit(a, b)` → the world point where the
 * segment a–b (the blade, or the flying sword's path this frame) touches his body, or null; and on a real hit `game.diabolos.pierce(point,
 * by, {via: 'hand' | 'swarm'})`. Until those exist, nothing happens (a safe check).
 */
import { Vector3 } from 'three';

/** Weapon types that are divine (more divine things later: one place). */
export const DIVINE_KINDS = new Set(['divine']);

export const DIVINE = {
    DMG_K: 1.5, // ordinary creatures take 1.5× the damage of a plain sword
    COLOR: 0xfff1c4, // white-gold
    GOLD: 0xffc84a,
    WHITE: 0xffffff,
    PIERCE_SPEED: 3.2, // m/s of the blade (or the point along it) that counts as a real blow on Diabolos — the same as any strike (Weapons.MIN_SWING_SPEED)
};

/** Is it a divine thing? A cell item ({kind:'weapon', type:'divine'}), a `Weapon` (type 'divine'), or a plain record with `divine: true`. */
export function isDivine(x) {
    if (!x) return false;
    if (x.divine === true || x.kind === 'divineSword') return true;
    return DIVINE_KINDS.has(x.type) && (x.kind === undefined || x.kind === 'weapon');
}

/** What a blow of this thing does: {mul — damage on ordinary creatures, pierces — can it pierce Diabolos}. */
export function divineStrikeHit(item) {
    return isDivine(item) ? { mul: DIVINE.DMG_K, pierces: true } : { mul: 1, pierces: false };
}

/** The cell/save record of a divine sword. */
export const divineSwordItem = (uid) => ({ kind: 'weapon', type: 'divine', godGift: true, magic: false, bonus: 0, ...(uid ? { uid } : {}) });

/**
 * Make a divine sword in the world (the host's / one-player computer: it is a weapon like any, sent to the others).
 * `hover`: it floats where a hand takes it (like a chest's reward); otherwise it lies on the ground under (x, z) at height y.
 * → the Weapon, or null (no weapon system: headless).
 */
export function makeDivineSword(game, x, y, z, { id = undefined, hover = true, yaw = 0 } = {}) {
    const W = game?.weapons;
    if (!W) return null;
    let w;
    if (hover) {
        w = W.spawnHovering('divine', new Vector3(x, y, z), id, { byHandle: true });
    } else w = W.spawnLying('divine', x, y, z, yaw, id);
    w.godGift = true;
    game.sync?.weaponAppeared?.(w, true);
    return w;
}

/** Diabolos's part, asked safely: where does the segment a–b touch him (or null)? */
export function diabolosTouch(game, a, b) {
    const d = game?.diabolos;
    if (!d || typeof d.bladeHit !== 'function' || d.dead) return null;
    return d.bladeHit(a, b) || null;
}

/** Pierce Diabolos with a divine thing. → true when he took it (his `pierce` exists). */
export function pierceDiabolos(game, point, by, via = 'hand') {
    const d = game?.diabolos;
    if (!d || typeof d.pierce !== 'function') return false;
    d.pierce(point, by, { via });
    return true;
}

/** «Кто/что» (CLAUDE.md): what the divine sword does and what is done to it. */
export const DIVINE_TARGETS = {
    diabolos: { does: 'pierce', why: 'единственное, что его уничтожает: удар остриём/лезвием в руке или вонзился, запущенный Левиосой «Атак» → diabolos.pierce' },
    creatures: { does: 'hit', why: 'как меч: рубит, колет, отрубает части; урон ×1,5' },
    players: { does: 'hit', why: 'как меч (сеть — как у всякого оружия), урон ×1,5' },
    iceQueen: { does: 'hit', why: 'как меч, ×1,5' },
    ghosts: { does: 'none', why: 'призраков не убить (GHOST_SPELLS): клинок проходит сквозь' },
    blocks: { does: 'break', why: 'ломает блоки как острый меч; заколдованный камень и дары богов — нет' },
    spells: { does: 'none', why: 'его не уничтожает НИ ОДНО заклинание (дар богов, isGodGift): взрывы, Инспириус, Total Destruction, огонь, лава, лёд, Gather, Liquidation' },
    levitation: { does: 'lift', why: 'Левиоса и Левиоса Максима поднимают его и швыряют «Атак» (исключение из правила даров богов)' },
    death: { does: 'stay', why: 'смерть владельца: падает у тела, не исчезает' },
    shop: { does: 'refuse', why: 'ломбард и скупщик не берут' },
};
