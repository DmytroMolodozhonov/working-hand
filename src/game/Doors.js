/**
 * Doors.js — «Create a Door», «Stand», opening by the handle.
 *
 * Hold wood in the hand (at least 12 — a tree gives 20) and say «Create a
 * Door»: the little block turns into a small door in your hand. Move the
 * hand away from you — the door grows; point at the place on the ground and
 * say «Stand»: it stands there, facing you (12 wood is used).
 *
 * A door opens like a real one: take the handle (bring the hand to the
 * golden knob) and push or pull — the door swings with the hand around its
 * hinges. A closed door can't be walked through.
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

export function doorModel(color) {
    const g = new THREE.Group();
    const { wood, dark, gold } = doorMats(color);
    // frame
    for (const [w, h, x, y] of [[0.16, H + 0.16, -W / 2 - 0.08, H / 2], [0.16, H + 0.16, W / 2 + 0.08, H / 2], [W + 0.32, 0.16, 0, H + 0.08]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, T + 0.08), dark);
        m.position.set(x, y, 0);
        m.castShadow = true;
        g.add(m);
    }
    // the leaf turns around its hinge (left edge)
    const hinge = new THREE.Group();
    hinge.position.set(-W / 2, 0, 0);
    g.add(hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), wood);
    leaf.position.set(W / 2, H / 2, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    for (const [y, h] of [[H * 0.72, H * 0.38], [H * 0.27, H * 0.38]]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, h, 0.04), dark);
        panel.position.set(W / 2, y, -T / 2 - 0.01);
        hinge.add(panel);
        const p2 = panel.clone();
        p2.position.z = T / 2 + 0.01;
        hinge.add(p2);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gold);
    knob.position.set(W - 0.22, H * 0.48, -T / 2 - 0.08);
    hinge.add(knob);
    const knob2 = knob.clone();
    knob2.position.z = T / 2 + 0.08;
    hinge.add(knob2);
    g.userData = { hinge, knob, knob2 };
    return g;
}

export class Doors {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> door
        this.making = null; // {model, color, block, scale}
    }

    // ---------------------------------------------------------- making
    /** «Create a Door» (hint string when it can't be done). */
    create() {
        const g = this.game;
        const s = g.inventory.inHand?.kind === 'res' ? g.inventory.inHand.stack : null;
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
        const model = doorModel(d.color);
        model.position.set(d.x, d.y, d.z);
        model.rotation.y = d.ry;
        // (a house door fills its opening: wider and taller than a made one)
        if (d.w || d.h) model.scale.set((d.w || W) / W, (d.h || H) / H, 1);
        g.scene.add(model);
        const door = { ...d, model, boxId: null, holdSide: null };
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
        door.a = Math.max(0, Math.min(1.75, a));
        door.model.userData.hinge.rotation.y = door.a;
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
        // opening by the handle: the hand at a knob drags the leaf around the hinge
        if (g.currentPose) {
            const me = ch.group.position;
            for (const door of this.list.values()) {
                if (door.lifted) continue;
                if (!door.holdSide && Math.abs(door.x - me.x) + Math.abs(door.z - me.z) > 9) continue; // (far: no hand can reach it)
                const hinge = door.model.userData.hinge;
                for (const side of ['right', 'left']) {
                    const hand = ch.getHandWorldPosition(side, _v);
                    const k1 = door.model.userData.knob.getWorldPosition(_v2);
                    const near1 = hand.distanceTo(k1);
                    const k2 = door.model.userData.knob2.getWorldPosition(new THREE.Vector3());
                    const near = Math.min(near1, hand.distanceTo(k2));
                    if (door.holdSide === side) {
                        // the angle of the hand around the hinge
                        const hp = hinge.getWorldPosition(new THREE.Vector3());
                        const local = hand.clone().sub(hp).applyAxisAngle(_v2.set(0, 1, 0), -door.ry);
                        const ang = Math.atan2(-local.z, local.x);
                        const want = Math.max(0, Math.min(1.75, ang));
                        if (Math.abs(want - door.a) > 0.6 || local.length() > (door.w || W) + 1.2) { door.holdSide = null; continue; } // let go
                        this._setAngle(door, door.a + (want - door.a) * Math.min(1, dt * 10));
                        if (Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
                    } else if (!door.holdSide && near < 0.4) {
                        door.holdSide = side;
                    }
                }
            }
        }
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
        this.game.scene.remove(d.model);
        if (d.boxId != null) this.game.collision.removeBox(d.boxId);
        this.list.delete(id);
    }

    snapshot() {
        // (house doors are part of the generated world: not saved, unless carried away)
        return [...this.list.values()].filter((d) => !d.gen || d.moved).map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, ry: d.ry, color: d.color, a: d.a || 0, w: d.w, h: d.h }));
    }

    restore(list) { for (const d of list || []) this._place(d); }

    dispose() {
        this._cancel();
        for (const d of this.list.values()) { this.game.scene.remove(d.model); if (d.boxId != null) this.game.collision.removeBox(d.boxId); }
        this.list.clear();
    }
}
