/**
 * Doors.js — «Create a Door», «Stand», opening by the handle.
 *
 * Hold wood in the hand (at least 12 — a tree gives 20) and say «Create a
 * Door»: the little block turns into a small door in your hand. Move the
 * hand away from you — the door grows; point at the place on the ground and
 * say «Stand»: it stands there, facing you (12 wood is used).
 *
 * A door opens like a real one (CLAUDE.md: hands, not animations): put the hand
 * on the handle and close the fingers — the hand holds it; push or pull — the
 * leaf swings with the hand round its hinges, stops at the frame and when it
 * is wide open; open the fingers — it stays where it is. A free hand never goes
 * through a leaf: pressed against it, it pushes the leaf (or, at the frame,
 * the leaf holds). A closed door can't be walked through.
 *
 * A locked door (a villager's house at night / with nobody home, the gates of a
 * throne room — src/game/Alohomora.js) doesn't give: the handle held, the leaf
 * only rattles in its frame. «Алохомора» unlocks it and it opens a crack; the
 * hand opens it the rest of the way.
 *
 * «Вингардиум Левиоса» pointed at a door lifts it: carry it and say the
 * words again to put it down somewhere else.
 *
 * A push of air or of a spell swings a leaf like a real one (blow / impulse): the push
 * across the leaf turns it round its hinges — the stronger, the faster — and the hinges'
 * friction slows it; it stops on the frame (a slam) and on its full opening (it bounces
 * back a little), and on a body standing in its way (the leaf doesn't go through anybody).
 * A leaf swings BOTH ways (a > 0: towards the door's local −Z, a < 0: towards +Z), each side
 * with its own stop (openLimit: a wall, a bed, a chest on that side), and a latch at 0 that
 * catches it coming shut from either side (a fast one slams — it never shoots through).
 * Which way it goes is where the push comes from: away from the push, whichever face it hits. «Вайнд» / «… Максима», «Overgrown» / «… Максима», a «Джолт» charge
 * (it bursts on the leaf), a blast's wave; any new pushing spell calls blow() / impulse().
 * Every door: the houses', the wizards' towers', the throne rooms' gates, «Create a Door»'s
 * (ships have doorways without doors). A LOCKED door only rattles in its frame: the lock
 * holds against any push (the spells shove, they don't pick locks — «Алохомора» does; a
 * «Бомбардо» at it breaks the door itself, Wreck.js). Every computer swings it the same;
 * the host tells where it came to rest.
 *
 * Doors are saved with the world and shared with the other players.
 */

import * as THREE from 'three';
import { isWood, TREE_KINDS } from '../world/Terrain.js';

const WOOD_NEEDED = 12;
const W = 1.6, H = 3.6, T = 0.18; // a full-size door
const DOOR_W = W, DOOR_H = H;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _l = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function woodColor(block) {
    const k = TREE_KINDS.findIndex((t) => t.wood === block);
    return [0x8b5a2b, 0xd9cfb5, 0x5a3a1e, 0x8a3f38, 0x3e2716][Math.max(0, k)];
}

const _mats = new Map(); // colour -> materials (shared by all doors of that wood)
function doorMats(color) {
    let m = _mats.get(color);
    if (!m) {
        m = {
            wood: new THREE.MeshLambertMaterial({ color }),
            dark: new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.65) }),
            gold: _mats.gold || (_mats.gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.3 })),
        };
        _mats.set(color, m);
    }
    return m;
}

/**
 * A door: the frame and a leaf turning round its hinge. `mirror`: the hinge on the right
 * (the right leaf of a gate); `gate`: a leaf of a castle gate — planks with iron bands,
 * a ring for a handle, no frame of its own (the stone doorway is its frame).
 * Both kinds swing both ways: a positive angle towards their local −Z, a negative one towards +Z.
 */
export function doorModel(color, { mirror = false, gate = false, ice = false, w: W = DOOR_W, h: H = DOOR_H } = {}) {
    const g = new THREE.Group();
    let { wood, dark, gold } = doorMats(color);
    // the Ice Castle's gates (IceQueen.js): clear glowing ice with a frost snowflake on each leaf
    if (ice) {
        wood = _mats.ice || (_mats.ice = new THREE.MeshLambertMaterial({ color: 0xcdeffd, transparent: true, opacity: 0.78, emissive: 0x24597a }));
        gold = _mats.frost || (_mats.frost = new THREE.MeshBasicMaterial({ color: 0xe8fbff }));
    }
    const m = mirror ? -1 : 1;
    // frame (its inner faces a hair inside the opening: a house door is scaled to fill its doorway
    // exactly, and faces flush with the stone of the doorway flickered through it)
    if (!gate) for (const [w, h, x, y] of [[0.17, H + 0.17, -W / 2 - 0.075, H / 2 + 0.005], [0.17, H + 0.17, W / 2 + 0.075, H / 2 + 0.005], [W + 0.32, 0.17, 0, H + 0.075]]) {
        const fm = new THREE.Mesh(new THREE.BoxGeometry(w, h, T + 0.08), dark);
        fm.position.set(x, y, 0);
        fm.castShadow = true;
        g.add(fm);
    }
    // the leaf turns around its hinge (the left edge; a mirrored one: the right)
    const hinge = new THREE.Group();
    hinge.position.set(-m * W / 2, 0, 0);
    g.add(hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), wood);
    leaf.position.set(m * W / 2, H / 2, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    if (ice) {
        // a snowflake of frost on both faces, and a frost rim
        for (const z of [-T / 2 - 0.02, T / 2 + 0.02]) {
            for (let k = 0; k < 3; k++) {
                const arm = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.06, 0.03), gold);
                arm.position.set(m * W / 2, H * 0.55, z);
                arm.rotation.z = (k / 3) * Math.PI + Math.PI / 2;
                hinge.add(arm);
            }
            const rim = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.07, 0.03), gold);
            rim.position.set(m * W / 2, H * 0.97, z);
            hinge.add(rim);
        }
    } else if (gate) {
        // iron bands across both faces
        const iron = _mats.iron || (_mats.iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.7, roughness: 0.5 }));
        for (const y of [H * 0.15, H * 0.5, H * 0.85]) {
            for (const z of [-T / 2 - 0.02, T / 2 + 0.02]) {
                const band = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.12, 0.04), iron);
                band.position.set(m * W / 2, y, z);
                hinge.add(band);
            }
        }
    } else {
        for (const [y, h] of [[H * 0.72, H * 0.38], [H * 0.27, H * 0.38]]) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, h, 0.04), dark);
            panel.position.set(m * W / 2, y, -T / 2 - 0.01);
            hinge.add(panel);
            const p2 = panel.clone();
            p2.position.z = T / 2 + 0.01;
            hinge.add(p2);
        }
    }
    // the handles (both faces): a golden knob, on a gate — an iron ring
    const knob = gate ? new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 14), ice ? gold : _mats.iron || (_mats.iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.7, roughness: 0.5 }))) : new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gold);
    knob.position.set(m * (W - 0.22), H * 0.48, -T / 2 - 0.08);
    hinge.add(knob);
    const knob2 = knob.clone();
    knob2.position.z = T / 2 + 0.08;
    hinge.add(knob2);
    g.userData = { hinge, knob, knob2, mirror };
    return g;
}

/** Door hands: how near the fingers must be to the handle, how much they must close / open (as the helm). */
export const DOOR_HAND = { GRAB_R: 0.42, CLOSE_CURL: 0.55, OPEN_CURL: 0.35, RELEASE_CURL: 0.28, RELEASE_MS: 160, CLOSE_WINDOW_MS: 900, SLIP: 0.75, MAX_A: 1.75, LEAF_PAD: 0.3 };

/**
 * The angle of a point round a door's hinge (door-local, the hinge at the origin): 0 = along the
 * closed leaf, positive round to local −Z, negative round to local +Z (the leaf swings both ways).
 */
export function hingeAngle(lx, lz, mirror = false) {
    return Math.atan2(-lz, mirror ? -lx : lx);
}

/**
 * A free hand against a leaf: it can't pass through it. `was` — the side of the leaf the hand was on
 * (+1: the side of growing angles, −1: the other), `h` — the hand's angle round the hinge now,
 * `a` — the leaf's angle. Returns the leaf's new angle (pushed away from the hand, either way; held
 * by the stops on each side — maxP / maxN — and caught by the latch when it comes shut) — or null
 * when the hand didn't cross it.
 */
export function leafPushed(was, h, a, maxP = DOOR_HAND.MAX_A, maxN = maxP) {
    if (!((was > 0 && h < a) || (was < 0 && h > a))) return null;
    if (a !== 0 && Math.sign(h) !== Math.sign(a)) return 0; // (pushed shut: the latch catches it — a push more opens it the other way)
    return Math.max(-maxN, Math.min(maxP, h));
}

/** A push swinging a leaf: Δω = K · (push across the leaf, m/s) / leaf width; the hinges' friction. */
export const DOOR_PUSH = {
    K: 0.55,
    DAMP: 1.6, // 1/s: the hinges' viscous friction
    DRY: 0.6, // rad/s²: their dry friction (a slow leaf stops)
    BOUNCE_OPEN: 0.3, // … off its full opening (the stop, either side)
    SLAM: 1.2, // rad/s: shut faster than this — a slam
    REST: 0.05, // rad/s: slower — it stands
    RATTLE: 0.35, // rad/s: a push this strong on a locked door rattles it
    REACH: 40, // m: doors further than this from a push are not looked at
};
/** How hard each pushing spell blows on a leaf (m/s across it, before falling off with distance). */
export const DOOR_SPELLS = { Wind: 13, WindMaxima: 39, Overgrown: 16, OvergrownMaxima: 32, Jolt: 20, JoltMaxima: 60 };

/**
 * The swing of a leaf over dt (pure): angle a, angular speed w → {a, w, hit} (hit: 'frame' when the
 * latch caught it shut, 'slam' — shut hard, 'open' at a full opening). It swings both ways: maxP — its
 * stop on the positive side, maxN — on the negative. Coming shut from either side the latch catches it
 * at 0 (a fast one slams: it never shoots through the frame); from 0 a push swings it either way.
 * Friction: viscous and dry.
 */
export function swingStep(a, w, dt, maxP = DOOR_HAND.MAX_A, maxN = maxP) {
    let hit = null;
    const a0 = a;
    a += w * dt;
    w *= Math.exp(-DOOR_PUSH.DAMP * dt);
    const dry = DOOR_PUSH.DRY * dt;
    w = Math.abs(w) <= dry ? 0 : w - Math.sign(w) * dry;
    if (a0 !== 0 && (a === 0 || Math.sign(a) !== Math.sign(a0))) { hit = Math.abs(w) > DOOR_PUSH.SLAM ? 'slam' : 'frame'; a = 0; w = 0; } // (shut: the latch catches it)
    else if (a >= maxP) { hit = 'open'; a = maxP; w = w > 0 ? -w * DOOR_PUSH.BOUNCE_OPEN : w; }
    else if (a <= -maxN) { hit = 'open'; a = -maxN; w = w < 0 ? -w * DOOR_PUSH.BOUNCE_OPEN : w; }
    if (Math.abs(w) < DOOR_PUSH.REST && (a === 0 || hit || Math.abs(w) < DOOR_PUSH.REST * 0.5)) w = 0;
    return { a, w, hit };
}

const _q = new THREE.Vector3();
const _n = new THREE.Vector3();

export class Doors {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> door
        this.making = null; // {model, color, block, scale}
        this.held = { left: null, right: null }; // the door whose handle each hand holds
        this._open = { left: 0, right: 0 }; // when the fingers were last open
        this._relT = { left: 0, right: 0 };
        this._pf = { left: null, right: null };
        this.input = null; // (tests) side → {G: world point, curl}: instead of the tracked hands
    }

    // ---------------------------------------------------------- making
    /** «Create a Door» (hint string when it can't be done). */
    create() {
        const g = this.game;
        let s = g.inventory.inHand?.kind === 'res' ? g.inventory.inHand.stack : null;
        if ((!s || !isWood(s.block)) && g.inventory.free) s = g.inventory.endlessWood(); // (creative: no wood needed)
        if (!s || !isWood(s.block)) return '🚪 Возьмите в руку дерево (выберите ячейку с древесиной — левый карман)';
        if (s.count < WOOD_NEEDED) return `🚪 Нужно ${WOOD_NEEDED} дерева, а у вас ${s.count}`;
        if (this.making) return null;
        const model = doorModel(woodColor(s.block));
        g.scene.add(model);
        this.making = { model, color: woodColor(s.block), block: s.block, stack: s, scale: 0.12, at: new THREE.Vector3(), ok: false };
        g.hud.setVoice('🚪 Отводите руку от себя — дверь растёт. Покажите место и скажите «Stand»', true);
        return null;
    }

    /** «Stand»: the door stands where the hand points. */
    stand() {
        const g = this.game;
        // a levitated door: put it down here
        if (this.carried) { this._putDown(); return true; }
        const m = this.making;
        if (!m) return false;
        if (!m.ok) { g.hud.setVoice('🚪 Покажите рукой на землю рядом (до 8 м)', true); return true; }
        if (g.ships?.footprintAt(m.at.x, m.at.y + 0.5, m.at.z)) { g.hud.setVoice('⚓ На корабле дверь не поставить', true); this._cancel(); return true; }
        if (!g.inventory.take(m.stack, WOOD_NEEDED)) { g.hud.setVoice('🚪 Не хватает дерева', true); return true; }
        const yaw = g.character.group.rotation.y;
        const id = 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
        this._place({ id, x: m.at.x, y: m.at.y, z: m.at.z, ry: yaw, color: m.color, a: 0 });
        g.sync?.door?.({ id, x: m.at.x, y: m.at.y, z: m.at.z, ry: yaw, color: m.color, a: 0 });
        this._cancel();
        g.hud.setVoice('🚪 Дверь стоит! Возьмитесь за ручку, чтобы открыть', true);
        return true;
    }

    _cancel() {
        if (!this.making) return;
        this.game.scene.remove(this.making.model);
        this.making = null;
    }

    _place(d) {
        const g = this.game;
        if (this.list.has(d.id)) { this._move(this.list.get(d.id), d); return; }
        // (a house door fills its opening: wider and taller than a made one — made to its size, not
        // stretched: a stretched model shears its leaf out of shape when it turns)
        const model = doorModel(d.color, { mirror: !!d.mirror, gate: !!d.gate, ice: !!d.ice, w: d.w || W, h: d.h || H });
        model.position.set(d.x, d.y, d.z);
        model.rotation.y = d.ry;
        g.scene.add(model);
        const door = { ...d, model, boxId: null, holdSide: null, hand: { left: 0, right: 0 } };
        this.list.set(d.id, door);
        this._setAngle(door, d.a || 0);
    }

    _move(door, d) {
        door.x = d.x; door.y = d.y; door.z = d.z; door.ry = d.ry;
        door.model.position.set(d.x, d.y, d.z);
        door.model.rotation.y = d.ry;
        this._setAngle(door, door.a || 0);
    }

    /** Swing the leaf (either way); a closed door blocks the way. */
    _setAngle(door, a) {
        if (a > 0.15) a = Math.min(a, this.openLimit(door, 1)); // (a wall, a bed, a chest on that side: the leaf stops on it)
        else if (a < -0.15) a = Math.max(a, -this.openLimit(door, -1));
        door.a = Math.max(-DOOR_HAND.MAX_A, Math.min(DOOR_HAND.MAX_A, a)) || 0;
        door.model.userData.hinge.rotation.y = door.mirror ? -door.a : door.a;
        const g = this.game;
        if (door.boxId != null) { g.collision.removeBox(door.boxId); door.boxId = null; }
        if (Math.abs(door.a) < 0.35 && !door.lifted) {
            // the box of the closed door (in world space, axis-aligned around it)
            const c = Math.cos(door.ry), s = Math.sin(door.ry);
            const dw = door.w || W;
            const hw = dw / 2 * Math.abs(c) + T / 2 * Math.abs(s) + 0.05, hd = dw / 2 * Math.abs(s) + T / 2 * Math.abs(c) + 0.05;
            door.boxId = g.collision.addBox({ minX: door.x - hw, maxX: door.x + hw, minY: door.y, maxY: door.y + (door.h || H), minZ: door.z - hd, maxZ: door.z + hd, kind: 'door' });
        }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        const ch = g.character;
        const m = this.making;
        if (m) {
            if (!g.inventory.inHand || g.inventory.inHand.stack !== m.stack) { this._cancel(); }
            else {
                // grows as the hand goes away from the shoulder
                const side = 'right';
                const hand = ch.getHandWorldPosition(side, _v);
                const shoulder = ch.rightArmAnchor.getWorldPosition(_v2);
                const reach = hand.distanceTo(shoulder);
                m.scale += (Math.max(0.12, Math.min(1, (reach - 0.6) / 1.2)) - m.scale) * Math.min(1, dt * 4);
                // where it would stand: where the hand points at the ground
                const dir = ch.getHandDirection(side, new THREE.Vector3());
                m.ok = false;
                for (let k = 1; k < 8; k += 0.25) {
                    const p = _v2.copy(hand).addScaledVector(dir, k);
                    const gy = g.collision.groundY(p.x, p.z);
                    if (p.y <= gy + 0.1) { m.at.set(p.x, gy, p.z); m.ok = true; break; }
                }
                if (m.ok && m.scale > 0.85) {
                    m.model.position.copy(m.at);
                    m.model.rotation.y = ch.group.rotation.y;
                    m.model.scale.setScalar(1);
                    m.model.traverse((o) => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.6; } });
                } else {
                    m.model.position.copy(hand).add(_v2.set(0, 0.1, 0));
                    m.model.rotation.y = ch.group.rotation.y;
                    m.model.scale.setScalar(m.scale * 0.35);
                    m.model.traverse((o) => { if (o.isMesh) o.material.opacity = 1; });
                }
            }
        }
        // leaves swung by a push (a spell, a blast)
        this._swing(dt);
        // a body walking into an open leaf pushes it away from itself (it doesn't go through)
        this._bodiesPush();
        // the hands on the doors: the handle held by closed fingers, a free hand against a leaf
        if (g.currentPose && !g.isDeadLocal) this._hands(dt);
        else this.releaseAll();
        // a levitated door follows the hand
        if (this.carried) {
            const c = this.carried;
            const side = c.side;
            const hand = ch.getHandWorldPosition(side, _v);
            const dir = ch.getHandDirection(side, _v2);
            const at = hand.clone().addScaledVector(dir, 4);
            c.door.x += (at.x - c.door.x) * Math.min(1, dt * 3);
            c.door.z += (at.z - c.door.z) * Math.min(1, dt * 3);
            c.door.y += (Math.max(at.y - 1, g.collision.groundY(c.door.x, c.door.z) + 0.5) - c.door.y) * Math.min(1, dt * 3);
            c.door.ry = ch.group.rotation.y;
            c.door.model.position.set(c.door.x, c.door.y, c.door.z);
            c.door.model.rotation.y = c.door.ry;
            if (Math.random() < 0.5) g.fx.spark(_v.set(c.door.x, c.door.y + 1.8, c.door.z), 0xc9a8ff, 0.08, _v2.set(0, 0.6, 0), 0.6);
        }
    }

    /** Is this hand free to take a handle (nothing in it)? */
    _free(side) {
        const g = this.game;
        return !g.items?.held?.[side] && !g.weapons?.hands?.[side]?.held && !g.books?.reading?.handBusy?.(side);
    }

    /** The grip point of a hand (in the closed fingers) and how closed they are. */
    _hand(side) {
        const g = this.game, ch = g.character;
        if (this.input) return this.input(side); // (tests)
        const G = g.weapons?.palmFrame ? g.weapons.palmFrame(side, this._pf[side] || (this._pf[side] = {})).G : ch.getHandWorldPosition(side, new THREE.Vector3());
        return { G, curl: ch.getGripCurl ? ch.getGripCurl(side) : 1 };
    }

    /** A point in the door's own frame, from its hinge (x along the closed leaf, z its normal). */
    _local(door, p, out) {
        const hp = door.model.userData.hinge.getWorldPosition(_v2);
        return out.copy(p).sub(hp).applyAxisAngle(UP, -door.ry);
    }

    _hands(dt) {
        const g = this.game;
        const me = g.character.group.position;
        const now = performance.now();
        const locked = (d) => !!g.locks?.doorLocked?.(d);
        for (const side of ['left', 'right']) {
            const h = this._hand(side);
            if (!h?.G) continue;
            if (h.curl < DOOR_HAND.OPEN_CURL) this._open[side] = now;
            const held = this.held[side];
            if (held) {
                const door = held;
                if (!this.list.has(door.id) || door.lifted) { this.release(side); continue; }
                // let go: the fingers open (for a moment) or the hand is pulled off the handle
                if (h.curl < DOOR_HAND.RELEASE_CURL) this._relT[side] += dt * 1000; else this._relT[side] = 0;
                const L = this._local(door, h.G, _l);
                const r = Math.hypot(L.x, L.z), lw = door.w || W;
                if (this._relT[side] > DOOR_HAND.RELEASE_MS || r > lw + DOOR_HAND.SLIP || r < lw * 0.35) { this.release(side); continue; }
                const want = Math.max(-this.openLimit(door, -1), Math.min(this.openLimit(door, 1), hingeAngle(L.x, L.z, door.mirror))); // (pull or push it: either way)
                if (locked(door)) {
                    // the handle doesn't give: the leaf only rattles in its frame
                    if (Math.abs(want - door.a) > 0.06) this._rattle(door);
                    if (Math.abs(want - door.a) > 0.5) this.release(side); // (pulled away hard: the hand slips off)
                    continue;
                }
                this._setAngle(door, door.a + (want - door.a) * Math.min(1, dt * 14));
                if (Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
                continue;
            }
            for (const door of this.list.values()) {
                if (door.lifted || (Math.abs(door.x - me.x) + Math.abs(door.z - me.z) > 9)) continue;
                if (door.holdSide && door.holdSide !== side) continue;
                const L = this._local(door, h.G, _l);
                const lw = door.w || W, dh = door.h || H;
                const r = Math.hypot(L.x, L.z), ha = hingeAngle(L.x, L.z, door.mirror);
                const inSpan = r > 0.15 && r < lw + 0.1 && L.y > 0 && L.y < dh;
                // take the handle: a free hand at a knob closes its fingers (having been open a moment ago)
                if (this._free(side) && h.curl >= DOOR_HAND.CLOSE_CURL && now - this._open[side] < DOOR_HAND.CLOSE_WINDOW_MS) {
                    const k1 = door.model.userData.knob.getWorldPosition(_v);
                    let near = h.G.distanceTo(k1);
                    near = Math.min(near, h.G.distanceTo(door.model.userData.knob2.getWorldPosition(_v)));
                    if (near < DOOR_HAND.GRAB_R) { this.grab(door, side); break; }
                }
                // a free hand against the leaf: it can't go through — it pushes it (the frame and the wall stop it)
                const across = r * Math.sin(ha - door.a); // (the hand's distance from the leaf's plane, signed)
                if (!inSpan || Math.abs(across) > DOOR_HAND.LEAF_PAD) { door.hand[side] = 0; continue; }
                const was = door.hand[side];
                door.hand[side] = Math.sign(across) || was;
                if (!was) continue;
                const to = leafPushed(was, ha, door.a, this.openLimit(door, 1), this.openLimit(door, -1));
                if (to == null) continue;
                if (locked(door)) { this._rattle(door); door.hand[side] = was; continue; } // (it holds: the hand stays on its side)
                if (to === 0 && door.a !== 0) this.game.sound?.playClang?.(0.08); // (the latch clicks)
                this._setAngle(door, to);
                door.hand[side] = was;
                if (Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
            }
        }
        // a rattling leaf shakes a little in its frame
        for (const door of this.list.values()) {
            if (!(door.shakeT > 0)) continue;
            door.shakeT -= dt;
            const j = door.shakeT > 0 ? Math.sin(now * 0.09) * 0.025 : 0;
            door.model.userData.hinge.rotation.y = (door.mirror ? -1 : 1) * (door.a + Math.abs(j) * (door.a < 0 ? -1 : 1));
        }
    }

    /**
     * How far this leaf can open to one side (dir +1: towards local −Z, −1: towards +Z) before it
     * meets something there (a wall, furniture, a chest, a bed — never goes through them). Looked at
     * again every couple of seconds (a blast, a bed moved).
     */
    openLimit(door, dir = 1) {
        const now = this.game.now?.() ?? performance.now();
        const key = dir < 0 ? '_limAtN' : '_limAt';
        if (door[key] != null && now - door[key] < 2000) return dir < 0 ? door.maxN : door.maxA;
        door[key] = now;
        const g = this.game, col = g.collision, t = g.world?.terrain?.data || g.terrain?.data;
        const m = door.mirror ? -1 : 1, lw = door.w || W, dh = door.h || H;
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        const blocked = (x, y, z) => {
            if (t?.isSolidAt?.(x, y, z)) return true;
            for (const b of col?.queryBoxes?.(x, x, z, z) || []) if (b.kind !== 'door' && y >= b.minY && y <= b.maxY && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
            return false;
        };
        let lim = DOOR_HAND.MAX_A;
        outer: for (let a = 0.2; a <= DOOR_HAND.MAX_A + 1e-6; a += 0.05) {
            for (const r of [lw * 0.35, lw * 0.7, lw - 0.1]) {
                const lx = -m * lw / 2 + m * Math.cos(a) * r, lz = -dir * Math.sin(a) * r;
                const x = door.x + c * lx + s * lz, z = door.z - s * lx + c * lz;
                for (const y of [door.y + 0.7, door.y + dh * 0.55]) if (blocked(x, y, z)) { lim = Math.max(0.15, a - 0.08); break outer; }
            }
        }
        if (dir < 0) door.maxN = lim; else door.maxA = lim;
        return lim;
    }

    // ------------------------------------------------------------ pushes
    /** The leaf's hinge (world) and the leaf's own frame for a point: {x along the leaf, y up, z across (+: the opening side)}. */
    _leafLocal(door, p, out) {
        const m = door.mirror ? -1 : 1, lw = door.w || W;
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        // the hinge: (-m·lw/2, 0, 0) of the door, turned by ry
        const hx = door.x + c * (-m * lw / 2), hz = door.z - s * (-m * lw / 2);
        // into the door's frame (un-turn ry), then the leaf's (un-turn its angle m·a)
        const dx = p.x - hx, dz = p.z - hz;
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        const t = m * door.a, ct = Math.cos(t), st = Math.sin(t);
        const qx = ct * lx - st * lz, qz = st * lx + ct * lz;
        return out.set(m * qx, p.y - door.y, -qz);
    }

    /** The leaf's normal towards its opening side (world), and its middle. */
    _leafNormal(door, out) {
        const m = door.mirror ? -1 : 1;
        // door frame: (-m sin a, 0, -cos a); turned by ry
        const nx = -m * Math.sin(door.a), nz = -Math.cos(door.a);
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        return out.set(c * nx + s * nz, 0, -s * nx + c * nz);
    }

    _leafMiddle(door, out) {
        const m = door.mirror ? -1 : 1, lw = door.w || W, dh = door.h || H;
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        // in the door's frame: the hinge plus half the leaf along (m cos a, -sin a)
        const lx = -m * lw / 2 + m * Math.cos(door.a) * lw / 2, lz = -Math.sin(door.a) * lw / 2;
        return out.set(door.x + c * lx + s * lz, door.y + dh / 2, door.z - s * lx + c * lz);
    }

    /**
     * A push on a leaf: `v` (m/s, world) — air or a spell moving across it, `k` (0..1) where along the
     * leaf from the hinge it pushes (the middle by default: the lever). A locked one only rattles.
     */
    impulse(door, v, k = 0.5) {
        if (!door || door.lifted || door.holdSide || this.carried?.door === door) return false;
        // the leaf goes away from the push, whichever face it hits (it swings both ways; shut, the latch catches it)
        const dw = DOOR_PUSH.K * v.dot(this._leafNormal(door, _n)) * (k / 0.5) / (door.w || W);
        if (Math.abs(dw) < 0.02) return false;
        if (this.game.locks?.doorLocked?.(door)) { if (Math.abs(dw) > DOOR_PUSH.RATTLE) this._rattle(door, true); return false; }
        door.spin = (door.spin || 0) + dw;
        return true;
    }

    /**
     * A doorway's leaf: hung on the side where it opens furthest (into the room (a wall, a bed or a chest
     * close to one jamb: the hinges go on the other). Returns the record with `mirror` set.
     */
    hangBest(d) {
        const a = this.openLimit({ ...d, a: 0, mirror: false }), b = this.openLimit({ ...d, a: 0, mirror: true });
        return b > a + 0.05 ? { ...d, mirror: true } : d;
    }

    /** A push of air over the place (a spell, a blast): vAt(p) → its push (m/s, world) at a point, or null. */
    blow(vAt, from = null) {
        let n = 0;
        for (const door of this.list.values()) {
            if (door.lifted) continue;
            if (from && Math.abs(door.x - from.x) + Math.abs(door.z - from.z) > DOOR_PUSH.REACH * 1.5) continue;
            const p = this._leafMiddle(door, _q);
            const v = vAt(p);
            if (v && this.impulse(door, v)) n++;
        }
        return n;
    }

    /**
     * The first leaf a moving point (a spell's charge) touches between `a` and `b` (pad: its size).
     * @returns {{door, s: number}|null} s: the share of the way
     */
    segmentHit(a, b, pad = 0.15) {
        let best = null;
        for (const door of this.list.values()) {
            if (door.lifted) continue;
            const lw = door.w || W, dh = door.h || H;
            if (Math.abs(door.x - a.x) + Math.abs(door.z - a.z) > Math.abs(b.x - a.x) + Math.abs(b.z - a.z) + lw * 2 + 2) continue;
            const p = this._leafLocal(door, a, new THREE.Vector3()), q = this._leafLocal(door, b, _q);
            // the leaf: x 0..lw, y 0..dh, z ±T/2 (padded) — a slab test along the segment
            let t0 = 0, t1 = 1;
            for (const [p0, p1, lo, hi] of [[p.x, q.x, -pad, lw + pad], [p.y, q.y, -pad, dh + pad], [p.z, q.z, -T / 2 - pad, T / 2 + pad]]) {
                const d = p1 - p0;
                if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) { t0 = 2; break; } continue; }
                let u0 = (lo - p0) / d, u1 = (hi - p0) / d;
                if (u0 > u1) [u0, u1] = [u1, u0];
                t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
                if (t0 > t1) break;
            }
            if (t0 <= t1 && t0 <= 1 && (!best || t0 < best.s)) best = { door, s: t0, k: Math.max(0.1, Math.min(1, (p.x + (q.x - p.x) * t0) / lw)) };
        }
        return best;
    }

    /** Leaves swinging by themselves (after a push): the hinges slow them, the frame / the stop / a body stop them. */
    _swing(dt) {
        const g = this.game;
        for (const door of this.list.values()) {
            if (!door.spin) continue;
            if (door.holdSide || door.lifted || g.locks?.doorLocked?.(door)) { door.spin = 0; continue; }
            const was = door.a;
            const r = swingStep(door.a, door.spin, Math.min(dt, 0.05), this.openLimit(door, 1), this.openLimit(door, -1));
            // a body in its way (me, the others, people, zombies, animals): the leaf stops on it
            const stop = this._bodyInSwing(door, was, r.a);
            if (stop != null) { r.a = stop; r.w = -r.w * 0.2; r.hit = 'body'; if (Math.abs(r.w) < DOOR_PUSH.REST * 4) r.w = 0; }
            this._setAngle(door, r.a);
            door.spin = r.w;
            if (r.hit === 'slam') g.sound?.playClang?.(Math.min(0.5, 0.15 + Math.abs(r.w) * 0.1));
            else if (r.hit === 'open' && Math.abs(r.w) > 0.4) g.sound?.playClang?.(0.12);
            if (!door.spin && g.authority) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); } // (where it came to rest)
        }
    }

    /** Every body near a door (me, the others, people, zombies, animals): fn(x, y, z, radius, mine). */
    _eachBody(fn) {
        const g = this.game;
        const me = g.character?.group.position;
        if (me && !g.isDeadLocal) fn(me.x, me.y - 1, me.z, 0.4, true);
        for (const [, r] of g.remotes || []) if (r.position) fn(r.position.x, r.position.y - 1, r.position.z, 0.4, false);
        for (const v of g.castleLife?.byId?.values() || []) if (!v.dead) fn(v.x, v.y + 1, v.z, 0.4, false);
        for (const z of g.zombies || []) if (!z.isDead) fn(z.group.position.x, z.group.position.y + 1, z.group.position.z, 0.4, false);
        for (const a of g.animals?.list || []) if (!a.dead) fn(a.group.position.x, a.group.position.y + 0.8, a.group.position.z, 0.7, false);
    }

    /**
     * Somebody walking through a doorway into an open leaf pushes it away from themselves (either
     * way, as far as its stop on that side) — the leaf never goes through a body. A shut leaf is a
     * wall (its box): the latch holds it, it is opened by the handle (or by the people who live there).
     * Every computer pushes it the same; my own body and the host (for everybody else) tell the others.
     */
    _bodiesPush() {
        const g = this.game, me = g.character?.group.position;
        if (!me) return;
        for (const door of this.list.values()) {
            if (Math.abs(door.a) < 0.35 || door.lifted || door.holdSide || this.carried?.door === door) continue;
            if (Math.abs(door.x - me.x) + Math.abs(door.z - me.z) > 60) continue;
            if (g.locks?.doorLocked?.(door)) continue;
            const lw = door.w || W, dh = door.h || H;
            let mine = false, moved = false;
            this._eachBody((x, y, z, rad, isMe) => {
                if (Math.abs(x - door.x) > lw + 1.5 || Math.abs(z - door.z) > lw + 1.5) return;
                if (y < door.y - 2.5 || y > door.y + dh + 0.5) return;
                const L = this._local(door, _q.set(x, y, z), _q);
                const r = Math.hypot(L.x, L.z);
                if (r < 0.45 || r > lw + rad * 0.5) return;
                const ha = hingeAngle(L.x, L.z, door.mirror), pad = Math.min(1.2, (rad + T / 2) / r);
                const off = ha - door.a;
                if (Math.abs(off) >= pad) return;
                // pushed away from the body: to the far side of it
                const to = off > 0 ? ha - pad : ha + pad;
                if (Math.sign(to) !== Math.sign(door.a) || Math.abs(to) < 0.4) return; // (not pushed shut by walking: the leaf holds)
                const was = door.a;
                this._setAngle(door, to);
                if (door.a !== was) { moved = true; mine ||= isMe; door.spin = 0; }
            });
            if (moved && (mine || g.authority) && Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
        }
    }

    /**
     * The way a leaf opens AWAY from somebody at (x, z) (+1 / −1: the sign of its angle): the people
     * push it open in the direction they walk. A leaf already open keeps its way (they go through it).
     */
    awaySign(door, x, z) {
        if (Math.abs(door.a) > 0.05) return Math.sign(door.a);
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        const lz = s * (x - door.x) + c * (z - door.z); // (which face of the doorway they stand at)
        return lz >= 0 ? 1 : -1; // (at +Z: it opens towards −Z, away from them — and the other way round)
    }

    /** Is there a body between the leaf's angles a0 → a1? The angle the leaf stops at, or null. */
    _bodyInSwing(door, a0, a1) {
        const lw = door.w || W;
        const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
        let stop = null;
        const test = (x, y, z, rad) => {
            if (Math.abs(x - door.x) > lw + 2 || Math.abs(z - door.z) > lw + 2) return;
            if (y < door.y - 2.5 || y > door.y + (door.h || H) + 0.5) return;
            const L = this._local(door, _q.set(x, y, z), _q);
            const r = Math.hypot(L.x, L.z);
            if (r < 0.25 || r > lw + rad) return;
            const ha = hingeAngle(L.x, L.z, door.mirror), pad = Math.min(1.2, (rad + T / 2) / Math.max(0.3, r));
            if (ha + pad < lo || ha - pad > hi) return;
            // stop just short of it (on the side the leaf came from)
            const at = a1 > a0 ? Math.max(a0, ha - pad) : Math.min(a0, ha + pad);
            if (stop == null || Math.abs(at - a0) < Math.abs(stop - a0)) stop = at;
        };
        this._eachBody(test);
        return stop;
    }

    /** A locked leaf tried by the hand: it rattles (a sound, a hint now and then). */
    _rattle(door, pushed = false) {
        const g = this.game;
        if (door.shakeT > 0) return;
        door.shakeT = 0.3;
        g.sound?.playClang?.(0.12);
        if (pushed) { if (Math.hypot(door.x - g.character.group.position.x, door.z - g.character.group.position.z) < 30) g.hud?.setVoice?.('🔒 Дверь заперта — её трясёт, но замок держит. Откройте «Алохоморой»', true); }
        else g.locks?.lockedTried?.(door);
    }

    /** The hand takes the handle: the fingers stay closed round it. */
    grab(door, side) {
        const g = this.game;
        this.held[side] = door;
        door.holdSide = side;
        this._relT[side] = 0;
        const hand = g.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(0.7);
        if (this.game.locks?.doorLocked?.(door)) this._rattle(door);
    }

    release(side) {
        const door = this.held[side];
        if (!door) return;
        this.held[side] = null;
        if (door.holdSide === side) door.holdSide = null;
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(null);
        this.game.sync?.doorAngle?.(door.id, door.a); // (where it stays)
    }

    releaseAll() { this.release('left'); this.release('right'); }

    /** «Вингардиум Левиоса» pointed at a door. */
    tryLift(side) {
        const g = this.game;
        const ch = g.character;
        const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
        const dir = ch.getHandDirection(side, new THREE.Vector3());
        let best = null;
        for (const door of this.list.values()) {
            const to = _v.set(door.x, door.y + 1.8, door.z).sub(hand);
            const d = to.length();
            if (d > 10) continue;
            const ang = dir.angleTo(to.normalize());
            if (ang < 0.4 && (!best || ang < best.ang)) best = { door, ang };
        }
        if (!best) return false;
        best.door.lifted = true;
        this._setAngle(best.door, 0);
        this.carried = { door: best.door, side };
        g.hud.setVoice('🪶 Дверь парит — скажите «Вингардиум Левиоса» или «Stand», чтобы поставить', true);
        return true;
    }

    _putDown() {
        const c = this.carried;
        this.carried = null;
        const d = c.door;
        d.lifted = false;
        d.moved = true;
        d.y = this.game.collision.groundY(d.x, d.z);
        d.model.position.y = d.y;
        this._setAngle(d, 0);
        this.game.sync?.door?.({ id: d.id, x: d.x, y: d.y, z: d.z, ry: d.ry, color: d.color, a: 0 });
        this.game.hud.setVoice('🚪 Дверь поставлена', true);
    }

    // ---------------------------------------------------------- network / save
    applyNet(d) { this._place(d); }
    applyAngle(id, a) { const d = this.list.get(id); if (d && !d.holdSide) this._setAngle(d, a); }

    /** Swing a door to an angle (house doors opened by the people living there). */
    swing(id, a) { const d = this.list.get(id); if (d && !d.holdSide && !d.lifted) this._setAngle(d, a); }

    /** A house door away from everybody is taken out of the scene (it comes back with the house). */
    remove(id) {
        const d = this.list.get(id);
        if (!d) return;
        if (this.carried?.door === d) this.carried = null;
        for (const side of ['left', 'right']) if (this.held[side] === d) this.release(side);
        this.game.scene.remove(d.model);
        if (d.boxId != null) this.game.collision.removeBox(d.boxId);
        this.list.delete(id);
    }

    snapshot() {
        // (house doors are part of the generated world: not saved, unless carried away)
        return [...this.list.values()].filter((d) => !d.gen || d.moved).map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, ry: d.ry, color: d.color, a: d.a || 0, w: d.w, h: d.h, ...(d.mirror ? { mirror: 1 } : {}), ...(d.gate ? { gate: 1 } : {}) }));
    }

    restore(list) { for (const d of list || []) this._place(d); }

    dispose() {
        this._cancel();
        for (const d of this.list.values()) { this.game.scene.remove(d.model); if (d.boxId != null) this.game.collision.removeBox(d.boxId); }
        this.list.clear();
    }
}
