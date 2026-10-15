/**
 * SurfBoards.js — surfboards: made by «Create a Board», carried by hand, ridden on waves.
 *
 *   - Creative: boards stand in the sand of sea beaches (three in a rack) and one by
 *     the starting pedestals. Elsewhere «Create a Board» (learned from a book-bird's
 *     book or a scroll) turns a tree (or wood in the hand) into a board.
 *   - Carry it like a real board: two hands on its rails (it follows the hands and
 *     never goes through the body), or one hand near the middle of a rail with the
 *     arm down — under the arm, on edge along the body. One hand at its end: it drags.
 *   - Put it on the water and open the hands: it floats (waves wash a free board
 *     ashore). Lift a knee over it and put the foot down: one foot on the board;
 *     paddle with the other leg (knee up and down, or kick the heel back) — each stroke
 *     pushes the board on. On a wave, put the other foot on too: standing, keep the
 *     balance by leaning (left/right turns, a deep crouch and arms out steady you).
 *     Lift the foot on the board (while on one foot): you are off, in the water.
 * Nothing happens by itself: the board leaves the hands only when they let go (an
 * open outstretched hand, a real throw, or both hands opened over the water/ground
 * that holds it), and you only get on and off with your own legs.
 *
 * Host (or single player) owns the free boards; the one who holds or rides a board
 * moves it and sends its pose with their own (`p.bd`).
 */

import * as THREE from 'three';
import { SurfWater } from './SurfWater.js';
import { BoardBody, SURF, riderInput } from './BoardPhysics.js';
import { nearestRail, solveTwoHands, solveOneHand, halfWidth } from './BoardHold.js';
import { BoardRegistry } from './BoardRegistry.js';
import { boardModel, disposeBoard } from '../entities/BoardModel.js';
import { DropGate, ThrowDetector, poseBehind } from './HandRelease.js';
import { TREE_KINDS, isWood, BLOCK, isCastleBlock } from '../world/Terrain.js';

const CLOSE_CURL = 0.55, OPEN_CURL = 0.35, LET_GO_CURL = 0.3;
const OFFSET = 2.0; // PLAYER_GROUND_OFFSET: the body's origin above the feet
const FREE_RANGE = 150;
const WOOD_NEEDED = 8;
const ST_CODE = { stand: 0, rest: 1, float: 2, fall: 3 };
const ST_NAME = ['stand', 'rest', 'float', 'fall'];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m4 = new THREE.Matrix4();
const _pf = {};
const r3 = (v) => Math.round(v * 1000) / 1000;

export class SurfBoards {
    constructor(game) {
        this.game = game;
        this.water = new SurfWater(game);
        this.reg = new BoardRegistry();
        this.models = new Map(); // id -> {model, body, boxId, rest}
        this.hold = null; // {id, grips: {left, right}, theta, gate: {left, right}, openSince: {left, right}}
        this.ride = null; // {id, body, foot, neutral, nT, legs0, since, cool}
        this.fly = null; // {id, t}: flying to me by «Акцио»
        this._open = { left: -1e9, right: -1e9 };
        this._openF = { left: -1e9, right: -1e9 };
        this._frame = 0;
        this._netT = 0;
        this._rackT = 0;
        this._legs = null;
        this._mountArm = { left: null, right: null };
        this._hintAt = {};
        this._mineAt = new Map(); // board id -> when (simT) I last made / held / rode / fell off it: only then the «how to get on» hints
        this.remote = new Map(); // playerId -> board id they carry/ride
        this.log = []; // (tests) what happened: mount, off, fall:cause, caught…
    }

    get auth() { return !this.game.sync || !!this.game.authority; }
    get mounted() { return !!this.ride; }
    get riding() { return this.ride?.body.riding ? this.ride : null; }
    handBusy(side) { return !!this.hold?.grips[side]; }
    get me() { return this.game.localId; }

    _note(e) { this.log.push(e); if (this.log.length > 40) this.log.shift(); }

    _say(t, key = t, every = 0) {
        const now = performance.now();
        if (every && now - (this._hintAt[key] || -1e9) < every) return;
        this._hintAt[key] = now;
        this.game.hud?.setVoice?.(t, true);
    }

    // ================================================================ records and models
    /** Put a board into the world (creative pedestal, beach racks, the spell, the network, a save). */
    spawn({ id, wood = 0, st = 'stand', p, yaw = 0, q = null, beach = false }, broadcast = false) {
        if (this.reg.map.has(id)) return this.reg.map.get(id);
        if (!q) q = this._standQuat(yaw, st);
        const b = this.reg.add({ id, wood, st, p: p.slice(), q: q.slice ? q.slice() : q, beach: beach || undefined });
        this._ensureModel(b);
        if (broadcast) this.game.sync?.net?.send({ t: 'bdnew', b: { id, wood, st, p: b.p, q: b.q, beach: beach || undefined } }, true);
        return b;
    }

    /** Standing: nose up, the deck facing (yaw); lying: flat. */
    _standQuat(yaw, st) {
        _e.set(st === 'stand' ? Math.PI / 2 - 0.12 : 0, yaw, 0, 'YXZ');
        return _q.setFromEuler(_e).toArray();
    }

    _ensureModel(b) {
        let m = this.models.get(b.id);
        if (m) return m;
        const model = boardModel(b.wood);
        model.position.fromArray(b.p);
        model.quaternion.fromArray(b.q);
        this.game.scene?.add(model);
        m = { model, body: null, boxId: null };
        this.models.set(b.id, m);
        this._setBox(b, m);
        return m;
    }

    /** A board standing in the sand is in the way (like a door). */
    _setBox(b, m) {
        const col = this.game.collision;
        if (!col) return;
        if (m.boxId != null) { col.removeBox(m.boxId); m.boxId = null; }
        if (b.st === 'stand' && !b.owner) {
            const [x, y, z] = b.p;
            m.boxId = col.addBox({ minX: x - 0.6, maxX: x + 0.6, minY: y - SURF.L / 2, maxY: y + SURF.L / 2, minZ: z - 0.6, maxZ: z + 0.6, kind: 'board' });
        }
    }

    _setState(b, st) {
        if (b.st === st) return;
        b.st = st;
        const m = this.models.get(b.id);
        if (m) this._setBox(b, m);
    }

    remove(id) {
        const m = this.models.get(id);
        if (m) { this.game.scene?.remove(m.model); disposeBoard(m.model); if (m.boxId != null) this.game.collision?.removeBox(m.boxId); }
        this.models.delete(id);
        this.reg.remove(id);
        if (this.hold?.id === id) this._dropHold();
        if (this.ride?.id === id) this._endRide();
    }

    // ================================================================ «Create a Board»
    /** Returns a hint string when it can't be made, null when made. */
    create() {
        const g = this.game, B = g.builder;
        const h = B?._hand?.();
        if (!h) return '🏄 Поднимите руку, покажите на дерево и скажите «Create a Board»';
        const creative = g.config.mode === 'creative';
        let at = null, wood = 0, src = null;
        // a tree on the ray (the instanced trees near spawn, or a voxel tree)
        const tree = B._treeOnRay?.(h.o, h.d, 10);
        if (tree) { wood = tree.kind || 0; at = new THREE.Vector3(tree.x, g.collision.groundY(tree.x, tree.z), tree.z); src = { tree }; }
        if (!at) {
            const cell = B._hitCell?.(h.o, h.d, 10);
            const kind = cell ? TREE_KINDS.findIndex((k) => k.wood === cell.type) : -1;
            if (cell && kind >= 0) {
                const cells = B._flood(cell, (t) => t === TREE_KINDS[kind].wood || t === TREE_KINDS[kind].leaves, 6, 500);
                const trunk = cells.filter((c) => c.type === undefined ? g.terrain.data.get(c.x, c.L, c.z) === TREE_KINDS[kind].wood : c.type === TREE_KINDS[kind].wood);
                if (trunk.length < 4 && !creative) return '🏄 Мало дерева — нужен ствол (4 бревна)';
                wood = kind; src = { cells };
                const low = trunk.length ? trunk.reduce((a, c) => (c.L < a.L ? c : a)) : cell;
                at = new THREE.Vector3(low.x, g.collision.groundY(low.x, low.z), low.z);
            } else if (cell && isWood(cell.type)) {
                const cells = B._flood(cell, (t) => isWood(t), 2, 6);
                if (cells.length < 6 && !creative) return '🏄 Мало дерева — нужно 6 досок или брёвен';
                src = { cells, castle: isCastleBlock(cell.type) ? cell : null };
                at = new THREE.Vector3(cell.x, g.collision.groundY(cell.x, cell.z), cell.z);
            }
        }
        // wood in the hand
        const inHand = g.inventory?.inHand?.kind === 'res' ? g.inventory.inHand.stack : null;
        if (!at && inHand && isWood(inHand.block)) {
            if (inHand.count < WOOD_NEEDED && !creative) return `🏄 Нужно ${WOOD_NEEDED} дерева, а у вас ${inHand.count}`;
            wood = Math.max(0, TREE_KINDS.findIndex((k) => k.wood === inHand.block));
            src = { stack: inHand };
        }
        // creative: out of nothing, where the hand points
        if (!at && (creative || src?.stack)) {
            const hit = g.terrain?.raycast?.(h.o, h.d, 12);
            const p = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : h.o.clone().addScaledVector(h.d, 4);
            at = new THREE.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
        }
        if (!at) return '🏄 Покажите рукой на дерево (до 10 м)';
        // use up the wood (not in Creative)
        if (!creative && src) {
            if (src.tree) { g.world.removeTree(src.tree); g.sync?.treeGone?.(src.tree.index); }
            if (src.cells) {
                const edits = [];
                for (const c of src.cells) { g.terrain.data.set(c.x, c.L, c.z, BLOCK.AIR); edits.push([c.x, c.L, c.z, BLOCK.AIR]); }
                B._sendEdits?.(edits);
                if (src.castle) g.castleLife?.damaged({ x: src.castle.x, y: src.castle.L - 1, z: src.castle.z }, g.localId, src.cells.length, false);
            }
            if (src.stack && !g.inventory.take(src.stack, WOOD_NEEDED)) return '🏄 Не хватает дерева';
        }
        const ch = g.character;
        const yaw = ch.group.rotation.y + Math.PI; // the deck faces the maker
        const w = this.water.sample(at.x, at.z);
        const onWater = w.kind !== 'land' && (w.depth || 0) > SURF.GROUND_DEPTH;
        const id = 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        const st = onWater ? 'float' : 'stand';
        const p = onWater ? [at.x, w.surface + w.h + SURF.T / 2, at.z] : [at.x, at.y + SURF.L * 0.38, at.z];
        this.spawn({ id, wood, st, p, yaw: onWater ? ch.group.rotation.y : yaw }, true);
        this._mineAt.set(id, this.simT || 0);
        for (let i = 0; i < 26; i++) g.fx?.spark(_v.set(at.x + (Math.random() - 0.5), at.y + Math.random() * 3, at.z + (Math.random() - 0.5)), i % 2 ? 0xffe2a8 : 0x9fe6ff, 0.1, _v2.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.8);
        g.hud?.setVoice?.('🏄 Доска готова! Возьмите её двумя руками за края или одной рукой под мышку', true);
        return null;
    }

    // ================================================================ frame
    update(dt) {
        this._frame++;
        this.simT = (this.simT || 0) + dt; // the game's own clock (gestures are timed by it, not by the wall clock)
        this.water.update();
        const g = this.game;
        if (g.currentPose) this._hands(dt);
        this._legsAndRide(dt);
        if (this.auth) this._freePhysics(dt);
        this._remoteBoards(dt);
        this._beachRacks(dt);
        this._net(dt);
    }

    // ---------------------------------------------------------------- «Акцио»
    /** Boards «Акцио» can pull: standing, lying, floating — not in somebody's hands or under their feet. */
    accioTargets() {
        const out = [];
        if (this.hold || this.ride || this.fly) return out;
        for (const b of this.reg.map.values()) {
            if (b.owner || b.st === 'ridden' || b.st === 'held') continue;
            const m = this.models.get(b.id);
            if (m) out.push({ id: b.id, pos: m.model.position });
        }
        return out;
    }

    /** «Акцио» on a board: mine while it flies (the others see it fly with my pose). */
    accioStart(id) {
        const b = this.reg.map.get(id), m = this.models.get(id);
        if (!b || !m || b.owner || this.hold || this.ride || this.fly) return false;
        if (this.auth) { if (!this.reg.take(id, this.me, 1)) return false; this._broadcastOwner(id, this.me, 1); }
        else { b.owner = this.me; b.st = 'held'; b.mode = 1; this.game.sync?.net?.send({ t: 'bdtake', id, mode: 1 }); }
        m.body = null; m.spin = 0;
        this._setBox(b, m);
        this.fly = { id, t: 0 };
        for (let i = 0; i < 16; i++) this.game.fx?.spark(m.model.position, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
        return true;
    }

    /** «Стоп» (or it could not get here): it falls where it is. */
    accioStop() {
        const F = this.fly;
        if (!F) return;
        this.fly = null;
        const b = this.reg.map.get(F.id);
        if (b && b.owner === this.me) this._free(b, 'fall', [0, 0, 0]);
    }

    /**
     * Where the flying board goes, by the hands that are free:
     *  two — across in front of the chest, deck up, its near rail in both hands;
     *  one — under that arm, on edge along the body, the hand on the middle of the rail;
     *  none — down in front of the feet.
     */
    _accioAim(free) {
        const ch = this.game.character, torso = this._torso(), p = ch.group.position;
        const A = this._aim || (this._aim = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), grip: null, mode: 'none', side: null });
        const hw = halfWidth(0);
        if (free.length === 2) {
            const L = this._grip('left').clone(), R = this._grip('right').clone();
            // the long axis across the body (the tail to the right), its −X rail towards the body
            _m4.makeBasis(torso.fwd, torso.up, torso.right);
            A.quat.setFromRotationMatrix(_m4);
            A.pos.addVectors(L, R).multiplyScalar(0.5).addScaledVector(torso.fwd, hw).addScaledVector(torso.up, -0.03);
            A.mode = 'two'; A.side = null; A.grip = null;
            return A;
        }
        if (free.length === 1) {
            const side = free[0], h = this._grip(side).clone();
            const out = torso.right.clone().multiplyScalar(side === 'left' ? -1 : 1);
            const g = new THREE.Vector3(side === 'left' ? -hw : hw, 0, 0);
            const res = solveOneHand({ g, h, tuck: { out, fwd: torso.fwd, up: torso.up, hipCenter: new THREE.Vector3(p.x, h.y, p.z), halfX: 0.55 }, floorY: this._floorY(), surfaceY: this._surfaceY(), torso });
            A.pos.copy(res.pos); A.quat.copy(res.quat);
            A.mode = 'one'; A.side = side; A.grip = g;
            return A;
        }
        A.pos.copy(p).addScaledVector(torso.fwd, 1.6);
        A.pos.y = this.game.collision.groundY(A.pos.x, A.pos.z) + 0.6;
        _e.set(0, ch.group.rotation.y, 0, 'YXZ');
        A.quat.setFromEuler(_e);
        A.mode = 'none'; A.side = null; A.grip = null;
        return A;
    }

    /**
     * The flying board, one frame. free: my free hands now. Returns 'fly', 'caught', 'landed' or 'gone'.
     */
    accioStep(dt, free) {
        const F = this.fly;
        if (!F) return 'gone';
        const b = this.reg.map.get(F.id), m = this.models.get(F.id);
        if (!b || !m || b.owner !== this.me) { this.fly = null; return 'gone'; }
        F.t += dt;
        const A = this._accioAim(free);
        const p = m.model.position;
        const to = _v.subVectors(A.pos, p);
        const d = to.length();
        if (d > 1e-3) p.addScaledVector(to, Math.min(1, (14 * dt) / d));
        // it turns as it comes: lined up with the hands by the time it is there
        m.model.quaternion.slerp(A.quat, Math.min(1, dt * (d < 4 ? 9 : 2.5)));
        b.p = p.toArray(); b.q = m.model.quaternion.toArray();
        if (Math.random() < 0.5) this.game.fx?.spark(p, 0xfff2a8, 0.07, _v2.set(0, 0.4, 0), 0.3);
        if (d < 0.35) {
            this.fly = null;
            p.copy(A.pos); m.model.quaternion.copy(A.quat);
            if (A.mode === 'none') { this._free(b, 'fall', [0, 0, 0]); return 'landed'; }
            // caught: the fingers close on the rail (it stays in the open hand until that closes once)
            const H = this.hold = this._newHold(b.id);
            H.fresh = true;
            const sides = A.mode === 'two' ? ['left', 'right'] : [A.side];
            for (const side of sides) {
                const local = m.model.worldToLocal(this._grip(side).clone());
                const r = nearestRail(local);
                H.grips[side] = A.mode === 'one' ? A.grip.clone() : new THREE.Vector3(r.x, 0, r.z);
                H.gate[side].reset(true);
                H.waitClose[side] = true;
                const hand = this.game.character.getActiveHands?.()[side];
                if (hand?.setGrip) hand.setGrip(0.62);
            }
            H.tucked = A.mode === 'one';
            b.st = 'held'; b.mode = A.mode === 'two' ? 1 : 2;
            this._say(A.mode === 'two' ? '🏄 Доска в руках. Положите её на воду и разожмите руки' : '🏄 Доска под мышкой. Вторую руку — на край, чтобы держать двумя', 'grab', 4000);
            return 'caught';
        }
        if (F.t > 5) { this.accioStop(); return 'landed'; }
        return 'fly';
    }

    // ---------------------------------------------------------------- hands
    _torso() {
        const ch = this.game.character, p = ch.group.position, yaw = ch.group.rotation.y;
        const t = this._T || (this._T = { center: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(), halfX: 0.62, halfY: 0.95, halfZ: 0.38 });
        t.center.set(p.x, p.y + 0.75, p.z);
        t.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        t.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        return t;
    }

    _floorY() { const col = this.game.collision; return this._fy || (this._fy = (x, z) => col.groundY(x, z)); }
    _surfaceY() {
        return this._sy || (this._sy = (x, z) => { const s = this.water.sample(x, z, undefined, this._ss || (this._ss = {})); return s.kind === 'land' ? null : s.surface + s.h; });
    }

    _hands(dt) {
        const g = this.game, ch = g.character;
        if (this.ride || g.combat?.dead || g.isDeadLocal) return;
        const now = performance.now();
        for (const side of ['left', 'right']) {
            const hand = ch.getActiveHands?.()[side];
            const visible = !!hand && hand.group.visible && !ch.handLost?.(side);
            const curl = visible ? ch.getGripCurl(side) : (this.hold?.grips[side] ? 1 : 0);
            const tracked = ch.isHandTracked ? ch.isHandTracked(side) : visible;
            if (curl < OPEN_CURL && visible) { this._open[side] = now; this._openF[side] = this._frame; }
            if (this.hold?.grips[side]) { this._letGo(side, curl, tracked, now); if (!this.hold) break; continue; }
            if (!visible) continue;
            // (recently open in time OR in frames: slow computers draw few frames a second)
            const closing = curl > CLOSE_CURL && (now - this._open[side] < 900 || this._frame - this._openF[side] <= 12);
            if (!closing) continue;
            if (g.items?.held?.[side] || g.weapons?.hands?.[side]?.held || g.books?.reading?.handBusy?.(side) || g.scrolls?.readingSide === side) continue;
            if (g.flight?.active || g.animals?.riding) continue;
            this._tryGrab(side);
        }
        if (this.hold) this._carry(dt);
    }

    _grip(side) {
        const pf = this.game.weapons?.palmFrame ? this.game.weapons.palmFrame(side, _pf) : null;
        return pf ? pf.G : this.game.character.getHandWorldPosition(side, new THREE.Vector3());
    }

    _tryGrab(side) {
        const G = this._grip(side);
        let best = null;
        for (const b of this.reg.map.values()) {
            if (b.owner && b.owner !== this.me) continue;
            if (this.hold && this.hold.id !== b.id) continue;
            if (b.st === 'ridden') continue;
            const m = this.models.get(b.id);
            if (!m || m.model.position.distanceToSquared(G) > 16) continue;
            const local = m.model.worldToLocal(_v.copy(G));
            const r = nearestRail(local);
            if (r.d < SURF.GRAB_REACH + 0.1 && (!best || r.d < best.d)) best = { b, m, grip: new THREE.Vector3(r.x, 0, r.z), d: r.d };
        }
        if (!best) return;
        const { b, m } = best;
        if (this.fly?.id === b.id) this.fly = null; // (caught by hand on its way)
        if (!this.hold) {
            if (this.auth) { if (!this.reg.take(b.id, this.me, 1)) return; this._broadcastOwner(b.id, this.me, 1); }
            else { b.owner = this.me; b.st = 'held'; this.game.sync?.net?.send({ t: 'bdtake', id: b.id, mode: 1 }); }
            this._setBox(b, m);
            if (m.body) m.body = null;
            this.hold = this._newHold(b.id);
            if (b.st !== 'held') b.st = 'held';
        }
        this.hold.grips[side] = best.grip;
        this.hold.gate[side].reset(true);
        this.hold.thr[side].reset();
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(0.62);
        const both = this.hold.grips.left && this.hold.grips.right;
        this._say(both ? '🏄 Доска в руках. Положите её на воду и разожмите руки' : '🏄 Держите доску: вторую руку на другой край, или несите под мышкой (рука опущена у бока)', 'grab', 4000);
    }

    _newHold(id) {
        return { id, grips: { left: null, right: null }, theta: 0, gate: { left: new DropGate(), right: new DropGate() }, thr: { left: new ThrowDetector(), right: new ThrowDetector() }, openSince: { left: 0, right: 0 }, waitClose: { left: false, right: false }, tucked: false, prevHand: null };
    }

    /**
     * The hand opens: a grip goes. The board itself leaves the hands only when they really let go:
     *  - both hands opened together (a two-handed board put down / dropped on purpose),
     *  - a real throw (a wind-up, a swing, the fingers opening at its end) — it flies,
     *  - the last hand: the outstretched hand clearly opened, or the board lies on the water / ground.
     * One hand opening while the other still holds only takes that hand off.
     */
    _letGo(side, curl, tracked, now) {
        const H = this.hold, ch = this.game.character;
        const other = side === 'left' ? 'right' : 'left';
        if (!tracked) { H.openSince[side] = 0; return; } // (a hand the camera lost never lets go)
        const gt = (this.simT || 0) * 1000; // (the game's clock: a stalled frame never cuts a swing in two)
        const arm = ch.armState ? ch.armState(side, side === 'left' ? (this._armL || (this._armL = {})) : (this._armR || (this._armR = {}))) : null;
        // a real throw with this hand (the other hand open or not on the board): it flies
        if (arm) {
            const thr = H.thr[side].update({ now: gt, hand: arm.hand, shoulder: arm.shoulder, vRel: arm.vRel, vWorld: arm.vWorld.toArray(), curl, tracked, behind: poseBehind(this.game.currentPose, side), weight: 4 });
            const otherFree = !H.grips[other] || ch.getGripCurl(other) < 0.5;
            if (thr && otherFree) {
                // the same throw as any thing in the hand (where the person looks, the swing's speed, the board's weight)
                const v = this.game.items?._throwVelocity ? this.game.items._throwVelocity(side, thr, new THREE.Vector3(), 4).toArray() : thr.vWorld;
                this._throwBoard(v);
                return;
            }
        }
        // («Акцио» put it into an open hand: it stays until the hand has closed on it once)
        if (H.waitClose[side]) { if (curl > CLOSE_CURL) H.waitClose[side] = false; else { H.openSince[side] = 0; return; } }
        if (curl < LET_GO_CURL) { if (!H.openSince[side]) H.openSince[side] = gt; } else H.openSince[side] = 0;
        const openFor = (s) => (H.openSince[s] && !H.waitClose[s] ? gt - H.openSince[s] : 0);
        if (H.grips[other]) {
            // both hands opened (together): the board is let go
            if (openFor(side) > 250 && openFor(other) > 150) { this._dropHold(true); return; }
            // only this one: it comes off, the other hand keeps the board (a little later: the other may be opening too)
            if (openFor(side) > 450 && !H.openSince[other]) this._release(side);
            return;
        }
        // the last hand: the outstretched hand clearly opened, or the board lies on something that holds it
        const open = arm && H.gate[side].update({ now: gt, curl, tracked, ...arm });
        if (open || (openFor(side) > 250 && this._supported())) this._release(side);
        // (held under the arm or hanging at the side, a hand opening does not drop it: swing and throw it, or stretch the arm out)
        else if (openFor(side) > 1500) this._say('🏄 Чтобы отпустить доску: вытяните руку и разожмите, бросьте её (замах и бросок) или положите на воду', 'letgo', 6000);
    }

    /** A real throw: the board flies with the hand's speed (heavier than a sword: less of it). */
    _throwBoard(vWorld) {
        const v = _v3.fromArray(vWorld);
        if (v.length() > 16) v.setLength(16);
        this._dropHold(false, v.toArray());
        this._note('throw');
    }

    /** The held board lies on the water or the ground (its weight is not on the hands). */
    _supported() {
        const m = this.models.get(this.hold?.id);
        if (!m) return false;
        const p = m.model.position;
        const s = this.water.sample(p.x, p.z);
        const base = s.kind === 'land' ? this.game.collision.groundY(p.x, p.z) : s.surface + s.h;
        return p.y - base < SURF.T + 0.35;
    }

    _release(side) {
        const H = this.hold;
        if (!H) return;
        H.grips[side] = null;
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(null);
        if (!H.grips.left && !H.grips.right) this._dropHold(true);
    }

    /** Both hands are off: the board is free where it is (falling, or floating if on the water). */
    _dropHold(throwIt = false, vOverride = null) {
        const H = this.hold;
        if (!H) return;
        this.hold = null;
        for (const side of ['left', 'right']) if (H.grips[side]) { const hand = this.game.character.getActiveHands?.()[side]; if (hand?.setGrip) hand.setGrip(null); }
        const b = this.reg.map.get(H.id), m = this.models.get(H.id);
        if (!b || !m) return;
        const p = m.model.position;
        const vel = this.game.character.handVelocity?.right ? _v3.copy(this.game.character.handVelocity.left).add(this.game.character.handVelocity.right).multiplyScalar(0.5) : _v3.set(0, 0, 0);
        if (vel.length() > 10) vel.setLength(10);
        const s = this.water.sample(p.x, p.z);
        const onWater = s.kind !== 'land' && (s.depth || 0) > SURF.GROUND_DEPTH && p.y - (s.surface + s.h) < SURF.T + 0.4;
        const st = onWater ? 'float' : 'fall';
        if (vOverride) { m.spin = (Math.random() - 0.5) * 3; this._free(b, onWater && vOverride[1] <= 0 ? 'float' : 'fall', vOverride); return; }
        this._free(b, st, throwIt ? vel.toArray() : [0, 0, 0]);
    }

    _free(b, st, v = [0, 0, 0]) {
        const m = this.models.get(b.id);
        if (b.owner === this.me) this._mineAt.set(b.id, this.simT || 0); // (I just let go of it / got off it)
        const p = m.model.position.toArray().map(r3), q = m.model.quaternion.toArray().map(r3);
        if (this.auth || b.owner === this.me) this.reg.free(b.id, b.owner || this.me, { p, q, v, st });
        b.owner = null; b.mode = 0; b.st = st; b.p = p; b.q = q; b.v = v;
        m.body = null;
        this._setBox(b, m);
        if (st === 'float') this._floatBody(b, m);
        this.game.sync?.net?.send({ t: 'bdfree', id: b.id, p, q, v, st }, true);
    }

    _floatBody(b, m) {
        _e.setFromQuaternion(m.model.quaternion, 'YXZ');
        // (lying on the water: its yaw is where the nose points)
        const nose = _v.set(0, 0, -1).applyQuaternion(m.model.quaternion);
        const yaw = Math.atan2(-nose.x, -nose.z);
        m.body = new BoardBody({ x: m.model.position.x, z: m.model.position.z, y: m.model.position.y, yaw });
        const v = b.v || [0, 0, 0];
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        m.body.u = v[0] * fx + v[2] * fz;
        m.body.w = v[0] * Math.cos(yaw) - v[2] * Math.sin(yaw);
        return m.body;
    }

    _carry(dt) {
        const g = this.game, ch = g.character, H = this.hold;
        const m = this.models.get(H.id);
        const b = this.reg.map.get(H.id);
        if (!m || !b || (b.owner && b.owner !== this.me)) { this.hold = null; return; }
        const torso = this._torso();
        const floorY = this._floorY(), surfaceY = this._surfaceY();
        let res;
        if (H.grips.left && H.grips.right) {
            const hA = this._grip('left').clone(), hB = this._grip('right').clone();
            const pA = ch.armState ? ch.armState('left', {}).palmUp : 0, pB = ch.armState ? ch.armState('right', {}).palmUp : 0;
            res = solveTwoHands({ gA: H.grips.left, gB: H.grips.right, hA, hB, curlA: ch.getGripCurl('left'), curlB: ch.getGripCurl('right'), palmUpA: pA, palmUpB: pB, prevTheta: H.theta, torso, floorY, surfaceY });
            H.theta = res.theta;
            if (res.slip) { this._release(res.slip === 'A' ? 'left' : 'right'); this._say('🏄 Руки слишком далеко — доска выскользнула из одной руки', 'slip', 3000); }
            ch.reachHand('left', res.drawA, 1, 0.13);
            ch.reachHand('right', res.drawB, 1, 0.13);
        } else {
            const side = H.grips.left ? 'left' : 'right';
            const h = this._grip(side).clone();
            const sh = (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_v2);
            const lat = _v.subVectors(h, ch.group.position).dot(torso.right);
            // under the arm: the hand on the middle of the rail, the arm down by the side (it stays there until the arm comes up)
            const drop = sh.y - h.y;
            if (Math.abs(H.grips[side].z) > SURF.L * 0.28 || drop < 0.25) H.tucked = false;
            else if (drop > 0.6 && Math.abs(lat) > 0.3) H.tucked = true;
            if (Math.abs(lat) < 0.05) _v.copy(torso.right).multiplyScalar(side === 'left' ? -1 : 1); else _v.copy(torso.right).multiplyScalar(Math.sign(lat));
            const tuck = H.tucked ? { out: _v.clone(), fwd: torso.fwd, up: torso.up, hipCenter: _v3.set(ch.group.position.x, h.y, ch.group.position.z).clone(), halfX: 0.55 } : null;
            const trail = ch.handVelocity?.[side] ? ch.handVelocity[side].clone().negate() : null;
            res = solveOneHand({ g: H.grips[side], h, tuck, trail, floorY, surfaceY, torso });
            H.mode = res.mode;
            ch.reachHand(side, res.draw, 1, 0.13);
        }
        // (the camera's hands shake: the board follows them a little smoothed, never lagging far)
        const k = H.fresh ? 1 : 1 - Math.exp(-dt * 22);
        H.fresh = false;
        m.model.position.lerp(res.pos, k);
        if (m.model.position.distanceTo(res.pos) > 0.3) m.model.position.copy(res.pos);
        m.model.quaternion.slerp(res.quat, k);
        b.p = m.model.position.toArray(); b.q = m.model.quaternion.toArray();
        b.mode = H.grips.left && H.grips.right ? 1 : 2;
    }

    // ---------------------------------------------------------------- legs and riding
    _legsAndRide(dt) {
        const g = this.game, ch = g.character;
        const pose = g.currentPose;
        const legs = pose?.legs || null;
        if (legs?.seen) this._legsSeenAt = performance.now();
        if (this.ride) { this._riding(dt, pose, legs); return; }
        const reset = () => { this._mountArm.left = this._mountArm.right = null; this._march = 0; };
        if (this.fly || !pose || g.flight?.active || g.animals?.riding || g.levitation?.lifted || g.combat?.dead || g.isDeadLocal) { reset(); return; }
        // a floating board next to me (or the one in my hands, put on the water)?
        const near = this._mountable();
        if (!near) { reset(); return; }
        const now = this.simT * 1000;
        // the «how to get on» hints only for a board I am really using (in my hands on the water, or one I made /
        // let go of / fell off a moment ago) — never just for swimming past somebody's floating board
        const busy = near.held || (this.simT || 0) - (this._mineAt.get(near.b.id) ?? -1e9) < 20;
        if (!legs?.seen) {
            // the camera sees no legs at all: stepping in place by the board (a real march, not the camera's shake) gets on
            this._march = pose.isRunning && (pose.runIntensity || 0) > 0.35 ? (this._march || 0) + dt : Math.max(0, (this._march || 0) - dt * 0.5);
            if (this._march > 0.7) { this._march = 0; this.mount(near.b, 'left'); return; }
            if (busy) this._say('🦵 Камера не видит ваших ног — отойдите, чтобы были видны хотя бы бёдра, или шагайте на месте у доски, чтобы встать на неё', 'legs', 7000);
            return;
        }
        // a knee lifted over it and the foot put down: one foot on the board
        let best = 0;
        for (const side of ['left', 'right']) {
            const L = legs[side], arm = this._mountArm[side];
            best = Math.max(best, L.raise || 0);
            if (!arm) { this._mountArm[side] = { lifts: L.lifts, plants: L.plants, at: 0, peak: 0 }; continue; }
            if (L.lifts > arm.lifts) { arm.lifts = L.lifts; arm.at = now; arm.plantsAtLift = L.plants; }
            if (arm.at && L.plants > (arm.plantsAtLift ?? arm.plants) && now - arm.at < 3000) { this.mount(near.b, side); return; }
            if (arm.at && now - arm.at > 3000) arm.at = 0;
            arm.plants = L.plants;
            // a knee that came up a little but not enough: say so
            arm.peak = Math.max(arm.peak * Math.exp(-dt / 2), L.up ? 0 : L.raise || 0);
            if (arm.peak > 0.4 && arm.peak < 0.95 && !L.up) this._say(legs.hipsOnly ? '🦵 Поднимите колено выше — до пояса (камера видит вас только до бёдер)' : '🦵 Поднимите колено выше, над доской, и поставьте ногу', 'knee', 4000);
        }
        if (this.hold && !near.held) return;
        if (best < 0.2 && busy) this._say(near.held ? '🏄 Доска на воде. Поднимите колено над доской и поставьте ногу — руки отпустят её сами' : '🏄 Чтобы встать на доску: поднимите колено над ней и поставьте ногу', 'howmount', 9000);
    }

    /** A board on the water I could step on: {b, m, yaw, held}. Facing it any way: it is turned under the foot. */
    _mountable() {
        const ch = this.game.character, p = ch.group.position;
        let best = null;
        for (const b of this.reg.map.values()) {
            const held = this.hold?.id === b.id;
            if (held ? !this._onWater() : b.st !== 'float' || (b.owner && b.owner !== this.me)) continue;
            if (this.hold && !held) continue;
            const m = this.models.get(b.id);
            if (!m) continue;
            const bp = m.model.position;
            if (Math.abs(bp.x - p.x) > 6 || Math.abs(bp.z - p.z) > 6) continue;
            const feet = p.y - OFFSET;
            if (feet > bp.y + 1.2) continue; // (not from a cliff above it)
            const local = m.model.worldToLocal(_v.set(p.x, bp.y, p.z));
            const dx = Math.max(0, Math.abs(local.x) - SURF.W / 2), dz = Math.max(0, Math.abs(local.z) - SURF.L / 2);
            const d = Math.hypot(dx, dz);
            if (d > SURF.MOUNT_REACH) continue;
            const nose = _v2.set(0, 0, -1).applyQuaternion(m.model.quaternion);
            const yaw = Math.atan2(-nose.x, -nose.z);
            if (!best || d < best.d) best = { b, m, yaw, d, held };
        }
        return best;
    }

    /** The board in my hands lies on the water (deep enough to float it). */
    _onWater() {
        const m = this.models.get(this.hold?.id);
        if (!m) return false;
        const p = m.model.position, s = this.water.sample(p.x, p.z);
        return s.kind !== 'land' && (s.depth || 0) > SURF.GROUND_DEPTH && p.y - (s.surface + s.h) < SURF.T + 0.5;
    }

    /** One foot onto the board (the other leg paddles). */
    mount(b, foot = 'left') {
        if (typeof b === 'string') b = this.reg.map.get(b);
        if (!b) return false;
        const m = this._ensureModel(b);
        if (this.hold?.id === b.id) {
            // (the board in the hands, on the water: the hands let it go as the foot goes on)
            const H = this.hold;
            this.hold = null;
            for (const side of ['left', 'right']) if (H.grips[side]) { const hand = this.game.character.getActiveHands?.()[side]; if (hand?.setGrip) hand.setGrip(null); }
            b.owner = null; b.st = 'float';
            m.body = null;
            this._floatBody(b, m);
        }
        if (this.auth) { if (!this.reg.take(b.id, this.me, foot === 'left' ? 3 : 4)) return false; this._broadcastOwner(b.id, this.me, foot === 'left' ? 3 : 4); }
        else { b.owner = this.me; b.st = 'ridden'; this.game.sync?.net?.send({ t: 'bdtake', id: b.id, mode: foot === 'left' ? 3 : 4 }); }
        const body = m.body || this._floatBody(b, m);
        m.body = null;
        // the foot goes on as the person faces: the board is turned under it (from across or backwards too)
        const hy = this.game.character.group.rotation.y;
        if (Math.abs(Math.atan2(Math.sin(hy - body.yaw), Math.cos(hy - body.yaw))) > 0.6) { body.yaw = hy; body.w = 0; }
        const pose = this.game.currentPose;
        this.ride = { id: b.id, body, foot, neutral: pose?.torso ? { ...pose.torso } : null, nT: 0, legs0: this._legCounts(pose?.legs), since: performance.now(), runAcc: 0 };
        b.st = 'ridden';
        this._setBox(b, m);
        this.game.swim && (this.game.swim.swimming = false);
        this._note('mount:' + foot);
        this._say('🏄 Вы на доске! Гребите свободной ногой: поднимайте колено или отталкивайтесь пяткой назад');
        return true;
    }

    _legCounts(legs) { return legs ? { left: { ...legs.left }, right: { ...legs.right } } : null; }

    _riding(dt, pose, legs) {
        const g = this.game, ch = g.character, R = this.ride;
        const b = this.reg.map.get(R.id), m = this.models.get(R.id);
        if (!b || !m || (b.owner && b.owner !== this.me)) { this._endRide(); return; }
        const body = R.body;
        const now = performance.now();
        // the legs: counters since the last frame
        let strokes = 0;
        const paddle = R.foot === 'left' ? 'right' : 'left';
        if (legs && R.legs0) {
            const d = (side, k) => legs[side][k] - R.legs0[side][k];
            if (R.foot) {
                strokes = Math.max(0, d(paddle, 'strokes'));
                // the deck leg lifts: off the board, into the water
                if (d(R.foot, 'lifts') > 0) { R.legs0 = this._legCounts(legs); this.dismount('water'); return; }
                // the free leg lifts and comes down on the board: standing
                if (d(paddle, 'lifts') > 0 && body.riding) { R.foot = null; R.legs0 = this._legCounts(legs); this._say('🏄 Держите равновесие наклоном: влево-вправо — поворот, присесть и руки в стороны — устойчивее'); }
            }
            R.legs0 = this._legCounts(legs);
        }
        // the camera lost the legs: paddling by running in place instead
        if (R.foot && (!legs?.seen) && now - (this._legsSeenAt || 0) > 1500) {
            if (pose?.isRunning) { R.runAcc += dt * 1.6 * (pose.runIntensity || 0.5); if (R.runAcc >= 1) { strokes += Math.floor(R.runAcc); R.runAcc %= 1; } }
            this._say(body.riding ? '🦵 Камера не видит ваших ног — чтобы встать на доску, присядьте и выпрямитесь' : '🦵 Камера не видит ваших ног — гребите бегом на месте или отойдите от камеры', 'legsride', 8000);
            // standing up without seen legs: a crouch and up again (the pop-up) on a wave
            if (pose?.isCrouching) R.crouched = true;
            else if (R.crouched && body.riding) { R.crouched = false; R.foot = null; this._say('🏄 Держите равновесие наклоном: влево-вправо — поворот, присесть и руки в стороны — устойчивее'); }
        }
        // the lean's neutral: learned in the first 0.8 s, then slowly while not riding a wave
        if (pose?.torso) {
            if (!R.neutral) R.neutral = { ...pose.torso };
            const k = R.nT < 0.8 ? Math.min(1, dt * 4) : body.riding ? 0 : 0.05 * dt;
            R.nT += dt;
            R.neutral.lateral += (pose.torso.lateral - R.neutral.lateral) * k;
            R.neutral.noseRel += (pose.torso.noseRel - R.neutral.noseRel) * k;
            if (pose.torso.depth != null) R.neutral.depth = R.neutral.depth == null ? pose.torso.depth : R.neutral.depth + (pose.torso.depth - R.neutral.depth) * k;
        }
        const inp = R.nT > 0.8 ? riderInput(pose?.torso, R.neutral) : { lean: 0, trim: 0 };
        if (R.forceLean != null) inp.lean = R.forceLean; // (tests)
        const armsOut = !!ch.isTPose?.();
        const ev = body.step(dt, (x, z, t, o) => this.water.sample(x, z, t, o), {
            mode: R.foot ? 'one' : 'stand', strokes, strokeSide: paddle, ...inp, crouch: !!ch.isCrouching, armsOut, t: this.water.time(),
        });
        for (const e of ev) {
            this._note(e.type + (e.cause ? ':' + e.cause : ''));
            if (e.type === 'caught') this._say(R.foot ? '🌊 Волна подхватила вас! Встаньте на доску обеими ногами' : '🌊 Волна подхватила вас!');
            else if (e.type === 'lost') this._say('🌊 Волна ушла вперёд');
            else if (e.type === 'fall') { if (e.cause === 'shore') { this._say('🏖️ Доска выехала на берег — сойдите на песок'); this.dismount('shore'); return; } this.fall(e.cause); return; }
        }
        // the hero on the board
        this._placeBoard(m, body);
        this._placeRider(body, dt);
        b.p = m.model.position.toArray(); b.q = m.model.quaternion.toArray();
        b.mode = R.foot ? (R.foot === 'left' ? 3 : 4) : 5;
        // walking off onto the sand
        if (body.grounded && pose?.isRunning && (pose.runIntensity || 0) > 0.35) this.dismount('shore'); // (a real walk, not the camera's shake)
    }

    _placeBoard(m, body) {
        _e.set(body.pitch, body.yaw, -body.roll, 'YXZ');
        m.model.quaternion.setFromEuler(_e);
        m.model.position.set(body.x, body.y, body.z);
    }

    _placeRider(body, dt) {
        const g = this.game, ch = g.character, R = this.ride;
        const yaw = body.yaw;
        g.cameraBaseRotation = yaw; g.smoothBody = yaw;
        ch.group.rotation.y = yaw;
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        // one foot: the body over the rail on the paddling side (the paddle leg in the water)
        const lat = R.foot ? (R.foot === 'left' ? 0.45 : -0.45) : 0;
        const crouch = ch.isCrouching ? 0.7 : 0;
        ch.group.position.set(body.x + rx * lat, body.y + SURF.T / 2 + OFFSET - crouch, body.z + rz * lat);
        ch.swimY = null; ch.swimming = false; ch.speedScale = 1;
        // the legs: one on the deck (bent), the other paddling in the water; standing: knees bent
        R.phase = (R.phase || 0) + dt * 5;
        if (R.foot) {
            const deck = { hip: -0.35 }, pad = { hip: 0.25 + 0.35 * Math.sin(R.phase) };
            ch.legPose = R.foot === 'left' ? { left: deck, right: pad } : { left: pad, right: deck };
        } else ch.legPose = { left: { hip: -0.25 }, right: { hip: 0.25 } };
        ch.boardRoll = body.roll + body.beta;
        ch.group.rotation.x = -body.pitch * 0.6;
    }

    _endRide() {
        const ch = this.game.character;
        this.ride = null;
        ch.legPose = null;
        ch.boardRoll = 0;
        ch.group.rotation.x = 0;
    }

    /** Off the board by one's own legs ('water': beside it, 'shore': onto the sand). */
    dismount(how = 'water') {
        const R = this.ride;
        if (!R) return;
        const b = this.reg.map.get(R.id), m = this.models.get(R.id);
        const body = R.body;
        this._endRide();
        this._note('off:' + how);
        if (!b || !m) return;
        const ch = this.game.character;
        if (how === 'water') {
            const s = this.water.sample(body.x, body.z);
            ch.group.position.y = s.surface + s.h - 1.6;
        }
        m.body = body;
        this._free(b, body.grounded ? 'rest' : 'float', [0, 0, 0]);
        if (!body.grounded) { const mb = this.models.get(b.id); mb.body = body; body.fallen = null; body.beta = 0; }
        if (how === 'water') this._say('🏊 Вы в воде рядом с доской');
    }

    /** Knocked off the board (balance lost, the nose under water, a wave, a hit…). */
    fall(cause = 'balance') {
        const R = this.ride;
        if (!R) return;
        const g = this.game, ch = g.character, body = R.body;
        const b = this.reg.map.get(R.id), m = this.models.get(R.id);
        this._endRide();
        this._note('fall:' + cause);
        const msg = { balance: '💦 Вы упали с доски', pearl: '💦 Нос доски ушёл под воду — вы упали', wipeout: '💦 Волна накрыла вас', thrown: '🏖️ Доска выехала на берег — вас бросило вперёд', hit: '💦 Удар сбросил вас с доски', stunned: '💦 Вы упали с доски' }[cause] || '💦 Вы упали с доски';
        this._say(msg);
        const yaw = body.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const side = body.beta >= 0 ? -1 : 1;
        const s = this.water.sample(body.x, body.z);
        ch.group.position.set(body.x + rx * side * 1.2, Math.min(ch.group.position.y, s.surface + s.h - 1.4), body.z + rz * side * 1.2);
        const k = cause === 'pearl' || cause === 'thrown' ? 4 : 0;
        g.knockback?.set(fx * (body.u * 0.5 + k), 0, fz * (body.u * 0.5 + k));
        if (g.combat?.enabled && (s.depth || 9) < 1.5 && body.u > 6) g.combat.damage?.(1, null, 'board');
        if (b && m) {
            const keep = { u: body.u, w: body.w };
            body.fallen = null; body.beta = 0; body.riding = false;
            this._free(b, body.grounded ? 'rest' : 'float', [fx * keep.u, 0, fz * keep.u]);
            const mb = this.models.get(b.id);
            if (mb && !body.grounded) { mb.body = body; body.u = keep.u; body.w = keep.w; }
        }
    }

    /** A push on me (wind, a blast, a wave…): a rider falls unless it runs along the board. */
    onPush(v) {
        if (!this.ride || !v) return false;
        const body = this.ride.body;
        const along = (v.x * -Math.sin(body.yaw) + v.z * -Math.cos(body.yaw)) / (Math.hypot(v.x, v.z) || 1);
        if (Math.hypot(v.x, v.z) > 6 && along < 0.7) { this.fall('hit'); return true; }
        return false;
    }

    /** Everything held or ridden is let go (death, flight, lifted…). */
    dropAll(reason = '') {
        if (this.ride) { if (reason === 'dead') this.fall('hit'); else this.dismount('water'); }
        if (this.hold) this._dropHold(false);
    }

    /** An explosion: free boards are thrown, a rider falls. */
    blast(pos, radius, power = 1) {
        if (this.ride) { const p = this.game.character.group.position; if (p.distanceTo(pos) < radius + 3) this.fall('hit'); }
        if (!this.auth) return;
        for (const b of this.reg.map.values()) {
            if (b.owner) continue;
            const m = this.models.get(b.id);
            if (!m) continue;
            const d = m.model.position.distanceTo(pos);
            if (d > radius + 2) continue;
            const dir = _v.subVectors(m.model.position, pos).normalize();
            b.v = [dir.x * 8 * power, 6 * power, dir.z * 8 * power];
            m.body = null;
            this._setState(b, 'fall');
            m.spin = (Math.random() - 0.5) * 6;
        }
    }

    // ---------------------------------------------------------------- free boards (host)
    _freePhysics(dt) {
        const g = this.game;
        const players = [g.character.group.position, ...[...(g.remotes?.values() || [])].map((r) => r.position).filter(Boolean)];
        for (const b of this.reg.map.values()) {
            if (b.owner || b.st === 'stand' || b.st === 'rest' && !b.v?.some((x) => x)) continue;
            const m = this.models.get(b.id);
            if (!m) continue;
            const p = m.model.position;
            if (!players.some((q) => Math.abs(q.x - p.x) < FREE_RANGE && Math.abs(q.z - p.z) < FREE_RANGE)) continue;
            if (b.st === 'fall') this._fallStep(b, m, dt);
            else if (b.st === 'float') this._floatStep(b, m, dt);
            b.p = p.toArray(); b.q = m.model.quaternion.toArray();
        }
    }

    _fallStep(b, m, dt) {
        const v = b.v || (b.v = [0, 0, 0]);
        v[1] -= 20 * dt;
        const p = m.model.position;
        p.x += v[0] * dt; p.y += v[1] * dt; p.z += v[2] * dt;
        if (m.spin) m.model.rotateX(m.spin * dt);
        const s = this.water.sample(p.x, p.z);
        if (s.kind !== 'land' && (s.depth || 0) > SURF.GROUND_DEPTH && p.y <= s.surface + s.h + SURF.T / 2) {
            p.y = s.surface + s.h + SURF.T / 2;
            m.spin = 0;
            b.st = 'float';
            this._floatBody(b, m);
            for (let i = 0; i < 20; i++) this.game.fx?.spark(_v.copy(p).add(_v2.set((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2)), 0xe8fbff, 0.1, _v2.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.6);
            this.game.sound?.playSplash?.(p);
            return;
        }
        const gy = this.game.collision.groundY(p.x, p.z);
        if (p.y <= gy + SURF.T / 2 + 0.1) {
            // on the ground: lying flat on its fins and rocker, where its nose points
            const nose = _v.set(0, 0, -1).applyQuaternion(m.model.quaternion);
            const yaw = Math.atan2(-nose.x, -nose.z);
            p.y = gy + SURF.T / 2 + 0.12;
            _e.set(0, Number.isFinite(yaw) ? yaw : 0, 0, 'YXZ');
            m.model.quaternion.setFromEuler(_e);
            b.v = [0, 0, 0]; m.spin = 0;
            this._setState(b, 'rest');
        }
    }

    _floatStep(b, m, dt) {
        const body = m.body || this._floatBody(b, m);
        body.step(dt, (x, z, t, o) => this.water.sample(x, z, t, o), { mode: 'free', t: this.water.time() });
        body.fallen = null;
        this._placeBoard(m, body);
        if (body.grounded) { b.v = [0, 0, 0]; m.body = null; this._setState(b, 'rest'); }
    }

    // ---------------------------------------------------------------- beaches (Creative)
    _beachRacks(dt) {
        const g = this.game;
        if ((this._rackT -= dt) > 0) return;
        this._rackT = 2;
        if (g.config.mode !== 'creative' || !g.sea || !this.auth) return;
        const p = g.character.group.position;
        // untouched rack boards far from everybody go (they come back the same)
        for (const b of [...this.reg.map.values()]) {
            if (!b.beach || this.reg.beachTaken.has(b.id) || b.st !== 'stand') continue;
            if (Math.hypot(b.p[0] - p.x, b.p[2] - p.z) > 250) this.remove(b.id);
        }
        const seen = new Set();
        for (const spot of g.sea.beachesNear(p.x, p.z, 140)) {
            const ix = Math.round(spot.x / 16), iz = Math.round(spot.z / 16);
            const key = ix + '_' + iz;
            if (seen.has(key)) continue;
            seen.add(key);
            // a rack every ~50 m of beach
            if (((ix * 7 + iz * 13) % 3 + 3) % 3 !== 0) continue;
            // only on real sand (not on a castle's quay or land)
            const d = g.terrain?.data, sx = Math.round(spot.x), sz = Math.round(spot.z);
            if (d && (d.sites || d.castles)?.landAt?.(sx, sz)) continue;
            if (d && d.get(sx, d.topLayer(sx, sz), sz) !== BLOCK.SAND) continue;
            for (let i = 0; i < 3; i++) {
                const id = `cb_${ix}_${iz}_${i}`;
                if (this.reg.map.has(id) || this.reg.beachTaken.has(id)) continue;
                const ax = Math.cos(spot.yaw), az = -Math.sin(spot.yaw);
                const x = spot.x + ax * (i - 1) * 1.8, z = spot.z + az * (i - 1) * 1.8;
                const gy = g.collision.groundY(x, z);
                const wood = (Math.abs(ix * 31 + iz * 17 + i * 7 + (g.seed | 0)) % 5);
                this.spawn({ id, wood, st: 'stand', p: [x, gy + SURF.L * 0.38, z], yaw: spot.yaw + Math.PI, beach: true }, true);
            }
        }
    }

    // ---------------------------------------------------------------- network
    _broadcastOwner(id, to, mode) { this.game.sync?.net?.send({ t: 'bdown', id, to, mode }); }

    /** [id, x,y,z, qx,qy,qz,qw, mode] of the board I hold or ride (sent with my pose). */
    netMine() {
        const id = this.ride?.id || this.hold?.id || this.fly?.id;
        if (!id) return undefined;
        const m = this.models.get(id), b = this.reg.map.get(id);
        if (!m || !b) return undefined;
        const p = m.model.position, q = m.model.quaternion;
        return [id, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), b.mode || 1];
    }

    /** Another player's board pose (from their `p`). */
    remotePose(pid, bd) {
        if (!Array.isArray(bd) || typeof bd[0] !== 'string') { if (this.remote.has(pid)) this.remote.delete(pid); return; }
        const nums = bd.slice(1, 8).map(Number);
        if (!nums.every(Number.isFinite)) return;
        const b = this.reg.map.get(bd[0]);
        if (!b) return;
        b.owner = pid; b.mode = Math.max(0, Math.min(5, bd[8] | 0)); b.st = b.mode >= 3 ? 'ridden' : 'held';
        this.remote.set(pid, { id: bd[0], p: nums.slice(0, 3), q: nums.slice(3, 7) });
    }

    _remoteBoards(dt) {
        const k = Math.min(1, dt * 12);
        for (const [pid, r] of this.remote) {
            const m = this.models.get(r.id);
            if (!m) continue;
            const b = this.reg.map.get(r.id);
            if (b && b.owner !== pid) { this.remote.delete(pid); continue; }
            m.model.position.lerp(_v.fromArray(r.p), k);
            m.model.quaternion.slerp(_q.fromArray(r.q).normalize(), k);
            m.body = null;
            if (m.boxId != null) this._setBox(b, m);
            const av = this.game.remotes?.get(pid);
            if (av?.character && b?.mode >= 3) av.character.flying = false;
        }
    }

    onNet(m) {
        const g = this.game, net = g.sync?.net;
        const fin = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => Number.isFinite(+x) && Math.abs(+x) < 1e7);
        switch (m.t) {
            case 'bdnew': if (m.b && typeof m.b.id === 'string' && fin(m.b.p, 3) && fin(m.b.q, 4)) this.spawn({ id: m.b.id, wood: m.b.wood | 0, st: ST_CODE[m.b.st] != null ? m.b.st : 'fall', p: m.b.p.map(Number), q: m.b.q.map(Number), beach: !!m.b.beach }); break;
            case 'bds': if (!net?.isHost && Array.isArray(m.l)) {
                for (const e of m.l) {
                    if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
                    const b = this.reg.map.get(e[0]), mm = this.models.get(e[0]);
                    if (!b || !mm || b.owner === this.me) continue;
                    const nums = e.slice(1, 8).map(Number);
                    if (!nums.every(Number.isFinite)) continue;
                    mm.model.position.set(nums[0], nums[1], nums[2]);
                    mm.model.quaternion.set(nums[3], nums[4], nums[5], nums[6]).normalize();
                    const st = ST_NAME[e[8] | 0] || 'float';
                    if (b.st !== st) this._setState(b, st);
                    b.p = nums.slice(0, 3); b.q = nums.slice(3, 7);
                    mm.body = null;
                }
            } break;
            case 'bdtake': if (net?.isHost) {
                const mode = Math.max(1, Math.min(5, m.mode | 0));
                if (this.reg.take(m.id, m.from, mode)) { const mm = this.models.get(m.id); if (mm) { mm.body = null; this._setBox(this.reg.map.get(m.id), mm); } this._broadcastOwner(m.id, m.from, mode); }
                else { const b = this.reg.map.get(m.id); if (b) this._broadcastOwner(m.id, b.owner, b.mode); }
            } break;
            case 'bdown': {
                const b = this.reg.map.get(m.id);
                if (!b) break;
                b.owner = m.to; b.mode = m.mode | 0; b.st = b.mode >= 3 ? 'ridden' : 'held';
                // somebody else got it first: my hands / feet come off it
                if (m.to !== this.me) { if (this.hold?.id === m.id) { this.hold = null; for (const s of ['left', 'right']) { const h = g.character.getActiveHands?.()[s]; if (h?.setGrip) h.setGrip(null); } } if (this.ride?.id === m.id) this._endRide(); }
                const mm = this.models.get(m.id); if (mm) this._setBox(b, mm);
                break;
            }
            case 'bdfree': {
                const b = this.reg.map.get(m.id), mm = this.models.get(m.id);
                if (!b || !mm || !fin(m.p, 3) || !fin(m.q, 4)) break;
                if (b.owner && b.owner !== m.from && net?.isHost) break;
                b.owner = null; b.mode = 0;
                const v = fin(m.v, 3) ? m.v.map((x) => Math.max(-40, Math.min(40, +x))) : [0, 0, 0];
                b.p = m.p.map(Number); b.q = m.q.map(Number); b.v = v;
                mm.model.position.fromArray(b.p); mm.model.quaternion.fromArray(b.q).normalize();
                for (const [pid, r] of this.remote) if (r.id === m.id) this.remote.delete(pid);
                b.st = ST_CODE[m.st] != null ? m.st : 'fall';
                mm.body = null;
                if (b.st === 'float') this._floatBody(b, mm);
                this._setBox(b, mm);
                break;
            }
            case 'bdgone': this.remove(m.id); break;
            default: break;
        }
    }

    /** A player left: their boards fall where they were (host). */
    onLeave(pid) {
        this.remote.delete(pid);
        if (!this.auth) return;
        for (const id of this.reg.leave(pid)) {
            const b = this.reg.map.get(id), m = this.models.get(id);
            if (m) { b.p = m.model.position.toArray(); this._setBox(b, m); }
        }
    }

    _net(dt) {
        const g = this.game;
        if (!g.sync?.net?.isHost) return;
        this._netT += dt;
        if (this._netT < 0.1) return;
        this._netT = 0;
        const l = [];
        for (const b of this.reg.map.values()) {
            if (b.owner || (b.st !== 'float' && b.st !== 'fall')) continue;
            const m = this.models.get(b.id);
            if (!m) continue;
            const p = m.model.position, q = m.model.quaternion;
            l.push([b.id, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), ST_CODE[b.st]]);
        }
        if (l.length) g.sync.net.send({ t: 'bds', l });
    }

    // ---------------------------------------------------------------- save
    snapshot() {
        for (const b of this.reg.map.values()) { const m = this.models.get(b.id); if (m) { b.p = m.model.position.toArray().map(r3); b.q = m.model.quaternion.toArray().map(r3); } }
        return { list: this.reg.snapshot(), beachTaken: [...this.reg.beachTaken] };
    }

    restore(s) {
        if (!s) return;
        for (const id of s.beachTaken || []) this.reg.beachTaken.add(id);
        for (const r of s.list || []) {
            if (typeof r.id !== 'string' || !Array.isArray(r.p) || !Array.isArray(r.q)) continue;
            const old = this.reg.map.get(r.id);
            if (old) { const m = this.models.get(r.id); old.st = r.st; old.p = r.p; old.q = r.q; if (m) { m.model.position.fromArray(r.p); m.model.quaternion.fromArray(r.q); m.body = null; this._setBox(old, m); } continue; }
            this.spawn({ id: r.id, wood: r.wood | 0, st: r.st || 'rest', p: r.p, q: r.q, beach: !!r.beach });
        }
    }

    debugState() {
        return {
            boards: [...this.reg.map.values()].map((b) => ({ id: b.id, st: b.st, owner: b.owner, mode: b.mode, p: (this.models.get(b.id)?.model.position.toArray() || b.p).map(r3) })),
            log: this.log.slice(-10),
            hold: this.hold && { id: this.hold.id, left: !!this.hold.grips.left, right: !!this.hold.grips.right, mode: this.hold.mode || null },
            ride: this.ride && { id: this.ride.id, foot: this.ride.foot, riding: this.ride.body.riding, u: r3(this.ride.body.u), beta: r3(this.ride.body.beta), yaw: r3(this.ride.body.yaw) },
        };
    }

    dispose() {
        this.dropAll();
        for (const id of [...this.models.keys()]) this.remove(id);
    }
}
