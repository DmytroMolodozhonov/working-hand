/**
 * Expelliarmus.js — «Экспеллиармус»: a duel spell that knocks the wand out of the hand.
 *
 * A scarlet charge with a white core (Duel.js) flies where the raised hand points; it can
 * be blocked by «Protection» or met by another duel charge (a clash) like every duel spell.
 * Whom it reaches:
 *   - a player holding a wand: the wand flies out of the hand — a real throw, spinning,
 *     4–10 m off in a random direction, a few metres up — and lands as a loose thing anyone
 *     can pick up (the attacker too). No wand, but a sword in the hand: the sword flies.
 *     Neither: a small push. (The victim's own computer throws it — Duel.applyToMe.)
 *   - a wizard of a tower (a wand in the hand): the same; until the wizard gets it back he
 *     has no wand (no «Люмос», no practising). He runs to fetch it; if a player was quicker,
 *     the wand is the player's. Stuck on the way for long — he calls it back with «Акцио».
 *     A wanderer's staff (≈2.5 m, heavy) is not knocked out: he is only pushed back.
 *   - a knight / the king: the sword flies off (a real weapon, anyone can take it); without it
 *     he fights with his fists (half the damage) and drops no sword when he falls.
 *   - zombies, animals, sailors, villagers with tools: nothing to disarm — a small push.
 *   - a book-bird: knocked out of the air like by any charge (it falls as a book).
 *   - a living tree, the giant spider, a dragon: no effect (nothing in their «hands» to knock out).
 *   - the Ice Queen: her Ice Rod stays in her hand — «Экспеллиармус» is a simple spell without a scroll
 *     (IceQueen.iceBolt: such magic does nothing on her), and the Rod is a gift of the gods (godGift):
 *     no simple spell tears it from its holder. A player holding the Rod keeps it too (knockOutOfMyHand).
 *   - a phoenix: nothing in its claws — only a push (and it is an attack: Phoenixes.TARGETS).
 * The host owns loose things and the castle people; everybody sees the same flying wand.
 */

import * as THREE from 'three';
import { starterWand, rollWand } from './ItemTypes.js';
import { handLog } from './HandRelease.js';

export const EXPELLIARMUS = {
    MIN: 5.6, // m: how far the wand flies at least (the author: 40 % farther — it landed too near the wizard, who picked it up before «Акцио»)
    MAX: 14, // … and at most
    G: 14, // the loose things' gravity (Items.js)
    TRIES: 10, // random directions looked at (the first good one wins)
    FETCH_GIVE_UP: 20, // s: a wizard who can't reach his wand calls it back («Акцио»)
    FIST: 0.5, // a disarmed knight's blows: this part of his sword's
};

/** «Экспеллиармус» (and how the recognizer hears it) — only as the whole word, never inside talk. */
const EXP_RU = /^(?:э|е|и)кс?п[еэи]л{1,2}[иіыея]?[аяэе]?р?м[уаоы][сз]а?$/;
const EXP_EN = /^(?:ex|eks|ecs|ix)pp?ell?[iey]?[ae]?r?m[uoa][sz]$/;
const EXP_SPLIT = [/^(?:э|е|и)кс?п[еэи]л{1,2}[иіыея]?$/, /^[ая]?р?м[уаоы][сз]а?$/]; // «экспелли армус»

export function isExpelliarmus(text) {
    const words = String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-яі]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (EXP_RU.test(w) || EXP_EN.test(w)) return true;
        if (EXP_SPLIT[0].test(w) && i + 1 < words.length && EXP_SPLIT[1].test(words[i + 1])) return true;
    }
    return false;
}

/**
 * The velocity for a throw that lands `dist` m away (level ground) towards `yaw`, and its spin.
 * The higher it goes the longer it flies: 4 m ≈ 2 m up, 10 m ≈ 3.5 m up.
 */
export function flightVelocity(dist, yaw, rng = Math.random, out = new THREE.Vector3()) {
    const T = 0.9 + dist * 0.05; // s in the air
    const h = dist / T;
    out.set(Math.sin(yaw) * h, EXPELLIARMUS.G * T / 2, Math.cos(yaw) * h);
    const spin = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5);
    if (spin.lengthSq() < 1e-6) spin.set(1, 0, 0);
    spin.normalize().multiplyScalar(10 + rng() * 8); // (tumbling end over end)
    return { vel: out, spin };
}

/**
 * Where the wand goes from `at` (a point in the hand): a random direction and distance whose
 * way is free (no wall in between) and whose landing is solid ground not far below (not off a
 * tower top or a cliff). Dry land is better; water is all right (it can be fetched). `game`
 * may lack collision (tests): then the first random throw. → {vel, spin, land, dist, yaw}
 */
export function pickFlight(game, at, rng = Math.random) {
    const col = game?.collision;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < EXPELLIARMUS.TRIES; i++) {
        const yaw = rng() * Math.PI * 2;
        const dist = EXPELLIARMUS.MIN + rng() * (EXPELLIARMUS.MAX - EXPELLIARMUS.MIN);
        const land = new THREE.Vector3(at.x + Math.sin(yaw) * dist, at.y, at.z + Math.cos(yaw) * dist);
        let score = 0;
        if (col) {
            const gy = col.groundAt ? col.groundAt(land.x, land.z, at.y + 1) : col.groundY?.(land.x, land.z);
            if (Number.isFinite(gy)) {
                land.y = gy;
                if (gy < at.y - 8) score -= 4; // (a long drop: off a tower, a ship, a cliff)
                if (gy > at.y + 1.5) score -= 2; // (into a wall / up a slope)
            } else score -= 5;
            // the way: straight from the hand up over its top and down — no wall in between
            const top = at.y + 1.5;
            if (col.lineOfSight && !col.lineOfSight(at.x, at.y + 0.3, at.z, (at.x + land.x) / 2, top, (at.z + land.z) / 2, 0.5)) score -= 3;
            if (col.lineOfSight && !col.lineOfSight((at.x + land.x) / 2, top, (at.z + land.z) / 2, land.x, land.y + 0.6, land.z, 0.5)) score -= 3;
            if (game.swimming?.waterAt?.(land.x, land.z)) score -= 1; // (water: all right, dry land is better)
        }
        if (score > bestScore) { bestScore = score; best = { yaw, dist, land }; }
        if (score >= 0) break;
    }
    const { vel, spin } = flightVelocity(best.dist, best.yaw, rng);
    return { vel, spin, land: best.land, dist: best.dist, yaw: best.yaw };
}

const _p = new THREE.Vector3();

/**
 * My wand (else my sword) is knocked out of my hand: it flies off and lands as a loose thing.
 * → 'wand' | 'weapon' | null (nothing in my hands to knock out).
 */
export function knockOutOfMyHand(game, rng = Math.random) {
    const g = game, items = g.items;
    const w = items?.heldOf?.('wand');
    if (w) {
        const pos = w.model.position.clone(), quat = w.model.quaternion.clone();
        const f = pickFlight(g, pos, rng);
        if (g.wandMagic?.light) g.wandMagic._nox?.(false); // (Lumos goes out with the wand)
        const item = items.releaseHand(w.side);
        handLog('Волшебная палочка выбита из руки: «Экспеллиармус»');
        if (items.auth || !g.sync) items.spawnLoose(item, pos, { vel: f.vel, quat, spin: f.spin });
        else g.sync.itemThrow?.(item, pos, f.vel, quat, f.spin);
        return 'wand';
    }
    const ws = g.weapons;
    for (const side of ['right', 'left']) {
        const sw = ws?.hands?.[side]?.held;
        if (!sw || sw.stuckIn) continue;
        const f = pickFlight(g, sw.position || g.character.getHandWorldPosition(side, _p), rng);
        ws.release(side);
        sw.velocity?.copy(f.vel);
        sw.angularVelocity?.copy(f.spin).multiplyScalar(0.6);
        sw.wake?.();
        g.sync?._localRelease?.(sw); // (with the flight: everybody sees it fly)
        return 'weapon';
    }
    return null;
}

/** A wizard's own wand, rolled: a student's plain one, a robed one's strong one; a wanderer's is a staff. */
function rollWizardWand(v) {
    const w = v.robe ? (({ power, ...x }) => ({ ...x, power: Math.max(power || 0, 35 + Math.floor(Math.random() * 16)) }))(rollWand())
        : v.role === 'student' ? { ...starterWand(), color: 0x6b4a2b } : rollWand();
    if (v.model?.toolKind === 'staff' || v.role === 'wanderer') { w.staff = true; w.plain = false; } // (a long staff: a wand all the same — ItemTypes.wandModel draws it long)
    return w;
}

/** His own wand (rolled once, then always the same: in his hand in a duel, the one «Экспеллиармус» knocks out, the one that falls when he dies). */
export const wizardWandOf = (v) => v.wand || (v.wand = rollWizardWand(v));

/** The wand a castle wizard holds (made once). */
export function wizardWand(v, roll = wizardWandOf) {
    if (!v.wandItem) v.wandItem = roll(v);
    return v.wandItem;
}

/** The kinds of things in a castle person's hand that are a wand (VillagerModel tools): a wand, a wanderer's staff. */
export const WAND_TOOLS = new Set(['wand', 'staff']);

/**
 * (host) «Экспеллиармус» reached a castle person `v`: a wizard's wand / a knight's sword flies off.
 * → 'wand' | 'sword' | null (nothing knocked out: only the push).
 */
export function disarmVillager(game, v, makeWand = wizardWandOf) {
    const g = game, m = v.model;
    const kind = m?.toolKind;
    const hand = new THREE.Vector3(v.x, v.y + 2.6, v.z);
    if (v.wizard && WAND_TOOLS.has(kind) && !v.noWand && g.items) {
        if (m.getWandTip && m.tool) m.getWandTip(hand);
        const item = wizardWand(v, makeWand);
        const f = pickFlight(g, hand);
        m.setHeldTool('none');
        v.noWand = true;
        v.practice = null;
        g.items.spawnLoose(item, hand, { vel: f.vel, spin: f.spin });
        v.lostWand = { uid: item.uid, t: 0 };
        return 'wand';
    }
    if ((v.role === 'knight' || v.role === 'king') && (kind === 'sword' || kind === 'bigsword') && !v.disarmed && g.weapons) {
        const f = pickFlight(g, hand);
        m.setHeldTool('none');
        v.disarmed = true;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, f.yaw, 'XYZ'));
        const w = g.weapons.markMagic(g.weapons.spawn('sword', hand, q), v.role === 'king' ? 25 : 0);
        w.velocity?.copy(f.vel);
        w.angularVelocity?.copy(f.spin).multiplyScalar(0.6);
        w.wake?.();
        if (g.sync) { g.sync.weaponAppeared?.(w); g.sync._localRelease?.(w); }
        return 'sword';
    }
    return null;
}
