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
 * Doors are saved with the world and shared with the other players.
 */

import * as THREE from 'three';
import { isWood, TREE_KINDS } from '../world/Terrain.js';

const WOOD_NEEDED = 12;
const W = 1.6, H = 3.6, T = 0.18; // a full-size door
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
 * Both kinds open towards their local −Z.
 */
export function doorModel(color, { mirror = false, gate = false } = {}) {
    const g = new THREE.Group();
    const { wood, dark, gold } = doorMats(color);
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
    if (gate) {
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
    const knob = gate ? new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 14), _mats.iron) : new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gold);
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
 * closed leaf, growing as it goes round to the side the door opens to (local −Z).
 */
export function hingeAngle(lx, lz, mirror = false) {
    return Math.atan2(-lz, mirror ? -lx : lx);
}

/**
 * A free hand against a leaf: it can't pass through it. `was` — the side of the leaf the hand was on
 * (+1: the side the door opens to, −1: behind it), `h` — the hand's angle round the hinge now,
 * `a` — the leaf's angle. Returns the leaf's new angle (pushed by the hand, held by the frame and
 * the full opening) — or null when the hand didn't cross it.
 */
export function leafPushed(was, h, a, max = DOOR_HAND.MAX_A) {
    if (was > 0 && h < a) return Math.max(0, Math.min(max, h)); // pushed shut (from the opening side)
    if (was < 0 && h > a) return Math.max(0, Math.min(max, h)); // pushed open (from behind)
    return null;
}

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
        const model = doorModel(d.color, { mirror: !!d.mirror, gate: !!d.gate });
        model.position.set(d.x, d.y, d.z);
        model.rotation.y = d.ry;
        // (a house door fills its opening: wider and taller than a made one)
        if (d.w || d.h) model.scale.set((d.w || W) / W, (d.h || H) / H, 1);
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

    /** Swing the leaf; a closed door blocks the way. */
    _setAngle(door, a) {
        door.a = Math.max(0, Math.min(DOOR_HAND.MAX_A, a));
        door.model.userData.hinge.rotation.y = door.mirror ? -door.a : door.a;
        const g = this.game;
        if (door.boxId != null) { g.collision.removeBox(door.boxId); door.boxId = null; }
        if (door.a < 0.35 && !door.lifted) {
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
                const want = Math.max(0, Math.min(DOOR_HAND.MAX_A, hingeAngle(L.x, L.z, door.mirror)));
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
                const to = leafPushed(was, ha, door.a);
                if (to == null) continue;
                if (locked(door)) { this._rattle(door); door.hand[side] = was; continue; } // (it holds: the hand stays on its side)
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
            door.model.userData.hinge.rotation.y = (door.mirror ? -1 : 1) * (door.a + Math.max(0, j));
        }
    }

    /** A locked leaf tried by the hand: it rattles (a sound, a hint now and then). */
    _rattle(door) {
        const g = this.game;
        if (door.shakeT > 0) return;
        door.shakeT = 0.3;
        g.sound?.playClang?.(0.12);
        g.locks?.lockedTried?.(door);
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
