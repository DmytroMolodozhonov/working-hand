import { worldPlayers } from './WorldPlayers.js';
/**
 * Boats.js — small rowing boats for two (the sea update; the author 05.11: «заклинание, которое позволяет создавать лодки… максимум
 * 2 человека… нет руля… её можно найти в порту… навести на дерево… из дерева при помощи анимации создастся лодка. Потом лодку с
 * помощью Вингардиум Левиоса перетаскивает на воду, запрыгивает… так же, как и на доску… И заклинание, которое позволяет
 * заколдовать лодку… она начинает двигаться вперёд, пока ты на ней… голова определяет, куда она плывёт… стоп — останавливает,
 * не сразу, в течение нескольких секунд… стоп сбрасывает заклинание»; «создание лодки — 15 маны, заколдовать — 15 маны»).
 *
 *   «Create a Boat»  (15 mana) the wand at a tree, or at ≥ WOOD wood lying on the ground (or ≥ WOOD wood in the slots): the wood is
 *                    used up and the boat grows out of it — shavings swirl, the planks come together from the keel up (BUILD_T s).
 *   ports            every pier of a sea castle's port has a boat moored by it (the far side from the ship), the same on every computer.
 *   getting in       jump near a boat (≤ MOUNT_R m): you sit on a free seat (2 seats); jump again — you are out, beside it.
 *   «Navigare»       (15 mana) said in a boat (or on a surfboard): it goes forward on its own (SPEED m/s, picking up in a few
 *                    seconds) while the one who said it is in it; where the HEAD looks it turns (the head turned right — it turns
 *                    right; looking back — it turns hard). «Стоп» — it slows down over STOP_T s and stops: the spell is gone; to go on,
 *                    say it again. The caster out of it — it slows and stops the same way.
 *   carrying         «Wingardium Leviosa» lifts it like a thing (an empty boat); let go over the water — it floats, on land — it lies.
 * What may go wrong (see the tests): two players on one seat (the first takes it); the driver dies / leaves / is cut off — the boat
 * slows to a stop; it runs onto the land or a wall — it stops there (no going through: the bow's way is checked); a storm's waves rock
 * it; in space, hell, a lake — it floats on any water; an old save — no boats in it (only the ports', made anew).
 */
import * as THREE from 'three';
import { boatModel, BOAT_DIM, BOAT_SEATS, boatHalfWidth } from '../entities/BoatModel.js';
import { TREE_KINDS, isWood, BLOCK, isCastleBlock } from '../world/Terrain.js';

export const BOAT = {
    WOOD: 10, // wood (logs / planks) a boat takes
    COST: 15, DRIVE_COST: 15,
    BUILD_T: 3.2, // s the boat takes to come together
    MOUNT_R: 3.6, // m from the boat's middle a jump gets you in
    SPEED: 7.5, ACCEL: 2.4, // m/s, m/s² — enchanted
    TURN: 0.75, // rad/s at the most
    HEAD_GAIN: 1.6, // the head's turn (rad) → the turn rate
    STOP_T: 3, // s from «стоп» to still
    DRAG: 0.35, // 1/s: a free boat's way dies
    DRAFT: 0.45, // m of the hull under the water
    PORT_R: 260, FREE_R: 320, // m: the ports' boats made / any boat drawn
    MAX: 40,
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _o = {};
const r3 = (v) => Math.round(v * 1000) / 1000;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** One step of an enchanted boat (pure): b {yaw, u}, the head's turn (rad, + left), going (the spell on / stopping). */
export function driveStep(b, headYaw, dt, going, stopK = 1) {
    const target = going ? BOAT.SPEED : 0;
    if (going) b.u = Math.min(target, b.u + BOAT.ACCEL * dt);
    else b.u = Math.max(0, b.u - (BOAT.SPEED / BOAT.STOP_T) * dt * stopK);
    const turn = Math.max(-BOAT.TURN, Math.min(BOAT.TURN, headYaw * BOAT.HEAD_GAIN)) * Math.min(1, 0.3 + b.u / BOAT.SPEED);
    b.yaw = wrap(b.yaw + turn * dt);
    return b;
}

export class Boats {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id → {id, x, y, z, yaw, u, vy, st: 'float'|'ground'|'lev'|'build', seats: [pid|null, pid|null], drive, model, port}
        this.mine = null; // {id, seat}: the boat I sit in
        this.lev = null;
        this._portScan = 0;
        this._netT = 0;
        this._jumps = null;
        this.taken = new Set(); // the ports' boats moved away (saved): not made again at their piers
    }

    get me() { return this.game.localId; }
    get riding() { return !!this.mine; }
    get auth() { return !this.game.sync || !!this.game.authority; }

    // ------------------------------------------------------------------ the spells
    /** «Create a Boat»: → a hint (could not) or null (it is being made). */
    create() {
        const g = this.game, B = g.builder;
        const h = B?._hand?.();
        if (!h) return '⛵ Поднимите руку с палочкой, покажите на дерево и скажите «Create a Boat»';
        if (this.list.size >= BOAT.MAX) return '⛵ Лодок в мире и так много';
        const creative = g.config.mode === 'creative';
        let at = null, src = null;
        const tree = B._treeOnRay?.(h.o, h.d, 12);
        if (tree) { at = new THREE.Vector3(tree.x, g.collision.groundY(tree.x, tree.z), tree.z); src = { tree }; }
        if (!at) {
            const cell = B._hitCell?.(h.o, h.d, 12);
            const kind = cell ? TREE_KINDS.findIndex((k) => k.wood === cell.type) : -1;
            if (cell && kind >= 0) {
                const cells = B._flood(cell, (t) => t === TREE_KINDS[kind].wood || t === TREE_KINDS[kind].leaves, 6, 500);
                const trunk = cells.filter((c) => (c.type === undefined ? g.terrain.data.get(c.x, c.L, c.z) : c.type) === TREE_KINDS[kind].wood);
                if (trunk.length < 4 && !creative) return '⛵ Мало дерева — нужен ствол побольше';
                src = { cells };
                const low = trunk.length ? trunk.reduce((a, c) => (c.L < a.L ? c : a)) : cell;
                at = new THREE.Vector3(low.x, g.collision.groundY(low.x, low.z), low.z);
            } else if (cell && isWood(cell.type)) {
                const cells = B._flood(cell, (t) => isWood(t), 3, 40);
                if (cells.length < BOAT.WOOD && !creative) return `⛵ Мало дерева — нужно ${BOAT.WOOD} досок или брёвен`;
                src = { cells: cells.slice(0, Math.max(BOAT.WOOD, 1)), castle: isCastleBlock(cell.type) ? cell : null };
                at = new THREE.Vector3(cell.x, g.collision.groundY(cell.x, cell.z), cell.z);
            }
        }
        // wood lying on the ground where the hand points (≥ WOOD of it near the point)
        if (!at) {
            const hit = g.terrain?.raycast?.(h.o, h.d, 14);
            const p = hit ? _v.set(hit.x, hit.y, hit.z) : h.o.clone().addScaledVector(h.d, 6);
            const pile = [];
            let n = 0;
            for (const L of g.items?.loose?.values?.() || []) {
                const it = L.item;
                if (it?.kind !== 'res' || !isWood(it.block)) continue;
                if (L.model.position.distanceTo(p) > 3.5) continue;
                pile.push(L); n += it.count || 1;
            }
            if (pile.length) {
                if (n < BOAT.WOOD && !creative) return `⛵ Здесь ${n} дерева, а нужно ${BOAT.WOOD}`;
                src = { pile }; at = new THREE.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
            }
        }
        // wood in the slots: the boat comes where the hand points
        if (!at) {
            const stacks = (g.inventory?.slots || []).filter((s) => s && s.kind === 'res' && isWood(s.block));
            const have = stacks.reduce((a, s) => a + s.count, 0);
            if (have >= BOAT.WOOD || creative) {
                const hit = g.terrain?.raycast?.(h.o, h.d, 14);
                const p = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : h.o.clone().addScaledVector(h.d, 6);
                at = new THREE.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
                src = creative ? null : { stacks };
            } else if (have > 0) return `⛵ Нужно ${BOAT.WOOD} дерева, а у вас ${have}. Или покажите на дерево`;
        }
        if (!at) return '⛵ Покажите палочкой на дерево (до 12 м), на кучу дерева на земле — или держите 10 дерева в ячейках';
        // use up the wood
        if (!creative && src) {
            if (src.tree) { g.world.removeTree(src.tree); g.sync?.treeGone?.(src.tree.index); }
            if (src.cells) {
                const edits = [];
                for (const c of src.cells) { g.terrain.data.set(c.x, c.L, c.z, BLOCK.AIR); edits.push([c.x, c.L, c.z, BLOCK.AIR]); }
                B._sendEdits?.(edits);
                if (src.castle) g.castleLife?.damaged({ x: src.castle.x, y: src.castle.L - 1, z: src.castle.z }, this.me, src.cells.length, false);
            }
            if (src.pile) {
                let need = BOAT.WOOD;
                for (const L of src.pile) {
                    if (need <= 0) break;
                    const c = L.item.count || 1;
                    if (c <= need) { need -= c; g.items.removeLoose?.(L.item.uid); } else { L.item.count = c - need; need = 0; }
                }
            }
            if (src.stacks) { let need = BOAT.WOOD; for (const s of src.stacks) { const k = Math.min(need, s.count); g.inventory.take(s, k); need -= k; if (need <= 0) break; } }
        }
        const yaw = g.character.group.rotation.y;
        const id = 'bt' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        this.spawn({ id, x: at.x, z: at.z, yaw, st: 'build' }, true);
        g.sound?.playSea?.(at, 'chime', 0.7);
        g.hud?.setVoice?.('⛵ Из дерева складывается лодка…', true);
        return null;
    }

    /** «Navigare»: in my boat (or on my surfboard) — it goes. → hint or null. */
    enchant() {
        const g = this.game;
        if (!this.mine) {
            if (g.boards?.mounted) return g.boards.enchant?.() ?? null;
            return '⛵ Сядьте в лодку (прыжок рядом с ней) или встаньте на водяную доску — и скажите «Navigare»';
        }
        const b = this.list.get(this.mine.id);
        if (!b || b.st !== 'float') return '⛵ Лодка должна быть на воде';
        b.drive = { by: this.me, stop: false };
        this._netSend({ t: 'btdrive', id: b.id, by: this.me });
        for (let i = 0; i < 40; i++) g.fx?.spark(_v.set(b.x + (Math.random() - 0.5) * 3, b.y + 0.4, b.z + (Math.random() - 0.5) * 6), i % 2 ? 0x9fe6ff : 0xfff2b8, 0.12, _v2.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.9);
        g.sound?.playSea?.(_v.set(b.x, b.y, b.z), 'chime', 0.6);
        g.hud?.setVoice?.('⛵ Лодка поплыла! Куда смотрите — туда и поворачивает. «Стоп» — остановиться', true);
        return null;
    }

    /** «Стоп»: my enchanted boat slows to a stop (the spell is over). → true when there was one. */
    stop() {
        let any = false;
        for (const b of this.list.values()) if (b.drive && b.drive.by === this.me && !b.drive.stop) { b.drive.stop = true; any = true; this._netSend({ t: 'btdrive', id: b.id, by: this.me, stop: 1 }); }
        if (any) this.game.hud?.setVoice?.('⛵ Лодка замедляется…', true);
        return any;
    }

    // ------------------------------------------------------------------ the boats
    spawn(d, broadcast = false) {
        if (this.list.has(d.id)) return this.list.get(d.id);
        const g = this.game;
        const model = boatModel();
        g.scene.add(model);
        const b = { id: d.id, x: d.x, z: d.z, y: d.y ?? g.collision.groundY(d.x, d.z), yaw: d.yaw || 0, u: 0, vy: 0, st: d.st || 'float', seats: [null, null], drive: null, model, port: d.port || null, buildT: d.st === 'build' ? 0 : null, roll: 0, pitch: 0 };
        if (b.st === 'build') { b.st = 'ground'; b.buildT = 0; this._reveal(b, 0); }
        this.list.set(b.id, b);
        this._place(b, 0);
        if (broadcast) this._netSend({ t: 'btnew', b: { id: b.id, x: r3(b.x), z: r3(b.z), yaw: r3(b.yaw), build: b.buildT != null ? 1 : 0, port: b.port } }, true);
        return b;
    }

    remove(id) {
        const b = this.list.get(id);
        if (!b) return;
        if (this.mine?.id === id) this._getOut();
        b.model.parent?.remove(b.model);
        if (b.revealMat) b.revealMat.dispose();
        this.list.delete(id);
    }

    /** The boat comes together from the keel up (`k` 0…1): a material of its own while it is built (then the shared one again). */
    _reveal(b, k) {
        const mesh = b.model.userData.boatMesh;
        if (k >= 1) { if (b.revealMat) { mesh.material = b.revealMat.userData.base; b.revealMat.dispose(); b.revealMat = null; } return; }
        if (!b.revealMat) {
            const base = mesh.material, m = base.clone();
            m.userData.base = base;
            m.userData.U = { uK: { value: 0 } };
            m.onBeforeCompile = (sh) => {
                sh.uniforms.uK = m.userData.U.uK;
                sh.vertexShader = 'varying float vBy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBy = position.y + 0.2 * sin(position.z * 3.0) ;');
                sh.fragmentShader = 'uniform float uK;\nvarying float vBy;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat edge = uK * 2.4 - vBy;\nif (edge < 0.0) discard;\ngl_FragColor.rgb += vec3(1.0, 0.85, 0.45) * (1.0 - smoothstep(0.0, 0.18, edge)) * 1.6;');
            };
            m.customProgramCacheKey = () => 'boat-reveal';
            mesh.material = m; b.revealMat = m;
        }
        b.revealMat.userData.U.uK.value = k;
    }

    samples() { const m = boatModel(); return [m]; }

    // ------------------------------------------------------------------ the frame
    update(dt, pose = null) {
        const g = this.game;
        if (!(dt > 0)) return;
        this.t = (this.t || 0) + dt; // (the game's own clock: a jump out is not a jump back in)
        if (this.auth) this._portBoats(dt);
        const me = g.character?.group?.position;
        for (const b of this.list.values()) {
            if (b.buildT != null) this._build(b, dt);
            if (me && Math.hypot(b.x - me.x, b.z - me.z) > BOAT.FREE_R && this.mine?.id !== b.id) { b.model.visible = false; continue; }
            b.model.visible = true;
            if (b.st === 'lev') continue; // («Левиоса» carries it: Levitation moves the model)
            const driven = b.drive && b.drive.by === this.me;
            // who moves it: the one who drives it; else the host (a free boat); the others are told (`bts` / `btp`)
            if (driven || (!b.drive && this.auth) || (!g.sync)) this._physics(b, dt, driven);
            this._place(b, dt);
        }
        this._ride(dt, pose);
        this._net(dt);
    }

    _build(b, dt) {
        b.buildT += dt;
        const k = Math.min(1, b.buildT / BOAT.BUILD_T);
        this._reveal(b, k);
        const g = this.game, fx = g.fx;
        if (fx && k < 1) for (let i = 0; i < 3; i++) { // (the shavings swirl in round it)
            const a = Math.random() * 6.28, r = 2 + Math.random() * 3;
            fx.spark(_v.set(b.x + Math.cos(a) * r, b.y + 0.3 + Math.random() * 2.2, b.z + Math.sin(a) * r), Math.random() < 0.5 ? 0xd9a868 : 0xfff0b0, 0.1, _v2.set(-Math.cos(a) * 3 - Math.sin(a) * 2, 0.5, -Math.sin(a) * 3 + Math.cos(a) * 2), 0.7);
        }
        if (k >= 1) {
            b.buildT = null;
            if (fx) for (let i = 0; i < 40; i++) fx.spark(_v.set(b.x + (Math.random() - 0.5) * 3, b.y + 1, b.z + (Math.random() - 0.5) * 7), i % 2 ? 0xffe2a8 : 0x9fe6ff, 0.12, _v2.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.9);
            g.hud?.setVoice?.('⛵ Лодка готова! «Вингардиум Левиоса» — перенесите её на воду; прыжок рядом — сесть', true);
        }
    }

    /** The water / the ground under it, the way and the turn; it never goes through the land or a wall. */
    _physics(b, dt, driven) {
        const g = this.game, W = g.boards?.water;
        const s = W ? W.sample(b.x, b.z, undefined, _o) : null;
        const onWater = s && s.kind !== 'land' && (s.depth ?? 0) > 0.6;
        if (!onWater) {
            b.st = 'ground'; b.u = 0;
            const gy = g.collision.groundY(b.x, b.z);
            b.vy -= 18 * dt; b.y += b.vy * dt;
            if (b.y <= gy) { b.y = gy; b.vy = 0; }
            b.roll *= 0.9; b.pitch *= 0.9;
            if (b.drive && driven) { b.drive = null; this._netSend({ t: 'btdrive', id: b.id, by: this.me, stop: 2 }); }
            return;
        }
        b.st = 'float';
        // the spell: the head steers, «стоп» / the driver gone brakes it
        if (b.drive) {
            const inIt = b.seats.includes(b.drive.by);
            const going = !b.drive.stop && inIt;
            const head = driven ? (g._headBase?.yaw ?? g.smoothHead?.yaw ?? 0) : 0;
            driveStep(b, going ? head : 0, dt, going);
            if (!going && b.u <= 0.01) { b.drive = null; if (driven) g.hud?.setVoice?.('⛵ Лодка остановилась. Чтобы плыть — снова «Navigare»', true); }
        } else b.u *= Math.exp(-BOAT.DRAG * dt);
        // the way ahead: the land or a wall stops it (the bow's place a step on)
        if (b.u > 0.05) {
            const hx = -Math.sin(b.yaw), hz = -Math.cos(b.yaw);
            const nx = b.x + hx * (b.u * dt), nz = b.z + hz * (b.u * dt);
            const bx = nx + hx * BOAT_DIM.L * 0.5, bz = nz + hz * BOAT_DIM.L * 0.5;
            const t = g.terrain?.data, sb = W.sample(bx, bz, undefined, {});
            const blocked = sb.kind === 'land' || (sb.depth ?? 0) < 0.6 || (t?.isSolidAt?.(bx, s.surface + 0.6, bz) ?? false);
            if (blocked) { b.u = 0; if (driven && !b._toldShore) { b._toldShore = true; g.hud?.setVoice?.('⛵ Впереди берег — поверните голову, куда плыть', true); setTimeout(() => { b._toldShore = false; }, 4000); } } else { b.x = nx; b.z = nz; }
        }
        // the waves: it rides them — up and down, rocking along and across (sampled at the bow, the stern and the sides)
        const surf = s.surface + (s.h || 0);
        b.y += (surf - BOAT.DRAFT - b.y) * Math.min(1, dt * 6);
        const hx = -Math.sin(b.yaw), hz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
        const f = W.sample(b.x + hx * 3, b.z + hz * 3, undefined, {}), a = W.sample(b.x - hx * 3, b.z - hz * 3, undefined, {});
        const l = W.sample(b.x - rx * 1.3, b.z - rz * 1.3, undefined, {}), r = W.sample(b.x + rx * 1.3, b.z + rz * 1.3, undefined, {});
        const pitch = Math.atan2((f.h || 0) - (a.h || 0), 6), roll = Math.atan2((r.h || 0) - (l.h || 0), 2.6);
        b.pitch += (Math.max(-0.35, Math.min(0.35, pitch)) - b.pitch) * Math.min(1, dt * 4);
        b.roll += (Math.max(-0.3, Math.min(0.3, roll)) - b.roll) * Math.min(1, dt * 4);
        // a little wake behind a boat going
        if (b.u > 2 && g.fx?.spark && Math.random() < dt * 14) {
            const side = Math.random() < 0.5 ? -1 : 1;
            g.fx.spark(_v.set(b.x - hx * 3.4 + rx * side * 1, surf + 0.1, b.z - hz * 3.4 + rz * side * 1), 0xeaf8ff, 0.12, _v2.set(rx * side * 1.5 - hx * 1, 0.8 + Math.random(), rz * side * 1.5 - hz * 1), 0.7);
        }
    }

    _place(b) {
        b.model.position.set(b.x, b.y, b.z);
        b.model.rotation.set(b.pitch, b.yaw, -b.roll, 'YXZ');
    }

    /** The seat `k` of boat `b` in the world (the seat's top). */
    seatWorld(b, k, out = new THREE.Vector3()) {
        const s = BOAT_SEATS[k];
        out.set(s.x, s.y, s.z).applyEuler(b.model.rotation).add(b.model.position);
        return out;
    }

    // ------------------------------------------------------------------ getting in and out
    _ride(dt, pose) {
        const g = this.game, ch = g.character;
        if (!ch) return;
        const J = pose?.jump;
        const jumped = J && this._jumps != null && J.jumps !== this._jumps;
        if (J) this._jumps = J.jumps;
        if (this.mine) {
            const b = this.list.get(this.mine.id);
            if (!b || b.st === 'lev' || g.isDeadLocal) { this._getOut(); return; }
            if (jumped) { this._getOut(true); return; }
            // sitting on the seat: the body turns with the boat, the head is free (it steers)
            const p = this.seatWorld(b, this.mine.seat, _v);
            ch.group.position.set(p.x, p.y + 1.25, p.z);
            ch.group.rotation.y = b.yaw;
            g.cameraBaseRotation = b.yaw; g.smoothBody = b.yaw;
            ch.swimY = null; ch.swimming = false; ch.speedScale = 1; ch.verticalVelocity = 0; ch.onGround = true;
            ch.legPose = { left: { hip: -1.35 }, right: { hip: -1.35 } };
            ch.boardRoll = b.roll;
            return;
        }
        // a jump near a boat (on it, beside it in the water or on the pier): in
        if (!(ch.jumpAir || jumped)) return;
        if (this._outT != null && this.t - this._outT < 0.9) return; // (just jumped out of it)
        const me = ch.group.position;
        let best = null, bd = BOAT.MOUNT_R;
        for (const b of this.list.values()) {
            if (b.st === 'lev' || b.buildT != null || !b.model.visible) continue;
            const d = Math.hypot(b.x - me.x, b.z - me.z);
            if (d < bd && Math.abs(me.y - 2 - b.y) < 4 && b.seats.some((s) => s == null)) { bd = d; best = b; }
        }
        if (best) this._getIn(best);
    }

    _getIn(b) {
        const k = b.seats[0] == null ? 0 : 1;
        if (b.seats[k] != null) return false;
        b.seats[k] = this.me;
        this.mine = { id: b.id, seat: k };
        const ch = this.game.character;
        ch.jumpAir = false; ch.jumpVel?.set?.(0, 0, 0);
        this._netSend({ t: 'btseat', id: b.id, k, by: this.me }, true);
        this.game.hud?.setVoice?.(b.drive ? '⛵ Вы в лодке' : '⛵ Вы в лодке. «Navigare» — поплыть; прыжок — выпрыгнуть', true);
        this.game.sound?.playSplash?.();
        return true;
    }

    _getOut(jump = false) {
        const g = this.game, ch = g.character, M = this.mine;
        this.mine = null;
        this._outT = this.t || 0;
        ch.legPose = null; ch.boardRoll = 0;
        const b = M && this.list.get(M.id);
        if (!b) return;
        b.seats[M.seat] = null;
        this._netSend({ t: 'btseat', id: b.id, k: M.seat, by: null }, true);
        // beside it: the side with the more room (the land if there is some), up a little with the jump
        const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
        const W = g.boards?.water;
        let side = 1;
        if (W) { const L = W.sample(b.x - rx * 3, b.z - rz * 3, undefined, {}), R = W.sample(b.x + rx * 3, b.z + rz * 3, undefined, {}); if (L.kind === 'land' && R.kind !== 'land') side = -1; }
        ch.group.position.set(b.x + rx * side * (BOAT_DIM.B / 2 + 1.2), b.y + 2.6, b.z + rz * side * (BOAT_DIM.B / 2 + 1.2));
        if (jump) { ch.verticalVelocity = 6; ch.onGround = false; }
        if (b.drive && b.drive.by === this.me && !b.drive.stop) { b.drive.stop = true; this._netSend({ t: 'btdrive', id: b.id, by: this.me, stop: 1 }); } // (the caster out: it slows and stops)
    }

    onLeave(pid) { for (const b of this.list.values()) { b.seats = b.seats.map((s) => (s === pid ? null : s)); if (b.drive?.by === pid) b.drive.stop = true; } }

    // ------------------------------------------------------------------ the ports
    /** (host) A boat moored by every pier of the ports near (the far side from the ship), made as the player comes near. */
    _portBoats(dt) {
        this._portScan -= dt;
        if (this._portScan > 0) return;
        this._portScan = 2;
        const g = this.game, idx = g.world?.terrain?.data?.castles || null; // (the castles' index — as Ships finds the ports)
        const me = g.character?.group?.position;
        if (!idx?.near || !me) return;
        for (const p of worldPlayers(g)) for (const def of idx.near(p.x, p.z, BOAT.PORT_R)) {
            const port = def.port;
            if (!port || !Array.isArray(port.piers) || !Array.isArray(port.berths)) continue;
            port.piers.forEach((pr, k) => {
                const id = `${def.id}:boat${k}`;
                if (this.list.has(id) || this.taken.has(id)) return;
                const bt = port.berths.find((x) => x.pier === k) || port.berths[k];
                if (!bt || !pr.a || !pr.b) return;
                const ax = pr.b.x - pr.a.x, az = pr.b.z - pr.a.z, al = Math.hypot(ax, az) || 1;
                const ux = ax / al, uz = az / al;
                const mx = pr.a.x + ux * al * 0.45, mz = pr.a.z + uz * al * 0.45;
                // the side away from the ship: −(ship − pier axis), across the pier
                const sx = bt.x - mx, sz = bt.z - mz, along = sx * ux + sz * uz;
                let px = sx - ux * along, pz = sz - uz * along;
                const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
                const off = (pr.w || 7) / 2 + BOAT_DIM.B / 2 + 0.6;
                const x = mx - px * off, z = mz - pz * off;
                const yaw = Math.atan2(-ux, -uz); // (the bow out to sea, along the pier)
                this.spawn({ id, x, z, yaw, st: 'float', port: def.id, y: (g.boards?.water?.sample(x, z, undefined, {})?.surface ?? 0) - BOAT.DRAFT }, false);
            });
        }
    }

    // ------------------------------------------------------------------ «Левиоса»
    levTargets() {
        const out = [];
        if (this.lev) return out;
        for (const b of this.list.values()) if (b.st !== 'lev' && b.buildT == null && b.model.visible && b.seats.every((s) => s == null)) out.push({ id: b.id, pos: _v.set(b.x, b.y + 0.6, b.z).clone() });
        return out;
    }
    levStart(id) {
        const b = this.list.get(id);
        if (!b || b.st === 'lev' || b.seats.some((s) => s != null) || this.lev) return false;
        b.st = 'lev'; b.drive = null; b.u = 0;
        this.lev = { id };
        if (b.port) this.taken.add(b.id);
        this._netSend({ t: 'btlev', id, on: 1 }, true);
        return true;
    }
    levAlive() { const L = this.lev; if (!L) return false; const b = this.list.get(L.id); if (!b || b.st !== 'lev') { this.lev = null; return false; } return true; }
    levModel() { return this.lev ? this.list.get(this.lev.id)?.model || null : null; }
    levDrop() {
        const L = this.lev;
        if (!L) return;
        this.lev = null;
        const b = this.list.get(L.id);
        if (!b) return;
        const p = b.model.position;
        b.x = p.x; b.z = p.z; b.y = p.y; b.vy = 0;
        b.yaw = new THREE.Euler().setFromQuaternion(b.model.quaternion, 'YXZ').y;
        b.st = 'float'; b.pitch = 0; b.roll = 0;
        this._netSend({ t: 'btlev', id: b.id, on: 0, x: r3(b.x), y: r3(b.y), z: r3(b.z), yaw: r3(b.yaw) }, true);
    }

    // ------------------------------------------------------------------ the network and the save
    _netSend(m, reliable = false) { this.game.sync?.net?.send?.(m, reliable); }

    _net(dt) {
        if (!this.game.sync?.net) return;
        this._netT += dt;
        if (this._netT < 0.1) return;
        this._netT = 0;
        const l = [];
        for (const b of this.list.values()) {
            const mineToSend = b.drive ? b.drive.by === this.me : this.auth;
            if (!mineToSend || b.st === 'lev' || !b.model.visible) continue;
            if (!b.drive && b.u < 0.02 && b._sentAt && Math.abs(b._sentAt[0] - b.x) < 0.01 && Math.abs(b._sentAt[1] - b.z) < 0.01) continue;
            b._sentAt = [b.x, b.z];
            l.push([b.id, r3(b.x), r3(b.y), r3(b.z), r3(b.yaw), r3(b.u)]);
        }
        if (l.length) this._netSend({ t: 'bts', l });
        const lv = this.lev && this.list.get(this.lev.id);
        if (lv) { const p = lv.model.position; this._netSend({ t: 'btlevp', id: lv.id, p: [r3(p.x), r3(p.y), r3(p.z)], yaw: r3(lv.model.rotation.y) }); }
    }

    onNet(m) {
        const fin = (...a) => a.every((x) => Number.isFinite(+x) && Math.abs(+x) < 1e7);
        const by = m.from ?? m.id;
        switch (m.t) {
            case 'btnew': if (m.b && typeof m.b.id === 'string' && fin(m.b.x, m.b.z)) this.spawn({ id: m.b.id, x: +m.b.x, z: +m.b.z, yaw: +m.b.yaw || 0, st: m.b.build ? 'build' : 'float', port: m.b.port || null }); break;
            case 'bts': if (Array.isArray(m.l)) for (const e of m.l) {
                const b = Array.isArray(e) && this.list.get(e[0]);
                if (!b || !fin(e[1], e[2], e[3], e[4]) || (b.drive && b.drive.by === this.me) || b.st === 'lev') continue;
                b.x = +e[1]; b.y = +e[2]; b.z = +e[3]; b.yaw = +e[4]; b.u = +e[5] || 0; b.st = 'float';
            } break;
            case 'btseat': { const b = this.list.get(m.id); if (b && (m.k === 0 || m.k === 1)) { if (m.by == null) { if (b.seats[m.k] !== this.me) b.seats[m.k] = null; } else if (b.seats[m.k] == null || b.seats[m.k] === m.by) b.seats[m.k] = m.by; else if (b.seats[m.k] === this.me && this.mine?.id === b.id) { /* (both took it: the one with the smaller id keeps it) */ if (String(m.by) < String(this.me)) { this._getOut(); b.seats[m.k] = m.by; } } } break; }
            case 'btdrive': { const b = this.list.get(m.id); if (b) { if (m.stop === 2) b.drive = null; else b.drive = { by: m.by ?? by, stop: !!m.stop }; } break; }
            case 'btlev': { const b = this.list.get(m.id); if (!b) break; if (m.on) { b.st = 'lev'; b.drive = null; if (b.port) this.taken.add(b.id); } else if (fin(m.x, m.y, m.z)) { b.st = 'float'; b.x = +m.x; b.y = +m.y; b.z = +m.z; b.yaw = +m.yaw || 0; } break; }
            case 'btlevp': { const b = this.list.get(m.id); if (b && b.st === 'lev' && Array.isArray(m.p) && fin(...m.p)) { b.model.position.set(+m.p[0], +m.p[1], +m.p[2]); b.model.rotation.y = +m.yaw || 0; } break; }
        }
    }

    snapshot() {
        const list = [];
        for (const b of this.list.values()) if (!b.port || this.taken.has(b.id)) list.push({ id: b.id, x: r3(b.x), y: r3(b.y), z: r3(b.z), yaw: r3(b.yaw), port: b.port || null });
        return { list, taken: [...this.taken] };
    }
    restore(s) {
        if (!s) return;
        for (const id of s.taken || []) if (typeof id === 'string') this.taken.add(id);
        for (const r of s.list || []) {
            if (typeof r?.id !== 'string' || ![r.x, r.y, r.z].every(Number.isFinite)) continue;
            const b = this.list.get(r.id) || this.spawn({ id: r.id, x: r.x, z: r.z, y: r.y, yaw: r.yaw || 0, st: 'float', port: r.port || null });
            Object.assign(b, { x: r.x, y: r.y, z: r.z, yaw: r.yaw || 0 });
        }
    }

    /** Is a hand / body at (x, y, z) inside a boat's hull (the others' feet, the camera)? Spells use it to ask «a boat here?». */
    boatAt(x, y, z) {
        for (const b of this.list.values()) {
            const lx = x - b.x, lz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
            const bx = lx * c - lz * s, bz = lx * s + lz * c;
            if (Math.abs(bz) < BOAT_DIM.L / 2 && Math.abs(bx) < boatHalfWidth(bz, BOAT_DIM.D) + 0.1 && y > b.y - 0.2 && y < b.y + BOAT_DIM.D + 0.3) return b;
        }
        return null;
    }
}
