/** Host-owned, interruptible witness ritual; bodies, bones and drawings remain afterwards. */
import * as THREE from 'three';
import { SOUL_SEAL as S, sealable, knowsSoulSeal } from './SoulSealRules.js';
import { FX } from '../fx/WizardFx.js';

const _at = new THREE.Vector3();
export class SoulSeal {
    constructor(wizards) { this.wizards = wizards; this.game = wizards.game; this.game.soulSeal = this; this.scan = 0; }
    get life() { return this.wizards.life; }

    witness(by, witnesses) {
        const now = Date.now();
        for (const v of witnesses) {
            if (!v.wizard || v.dead || v.sleep) continue;
            const seen = v.sealWitnesses || (v.sealWitnesses = new Map());
            seen.delete(by); seen.set(by, now);
            while (seen.size > 10) seen.delete(seen.keys().next().value);
        }
    }

    onBody(b, restored = false) {
        if (this.game.authority === false || b.k !== 'p') return;
        if (!restored) b.witnesses = [];
        const ids = new Set(b.witnesses || []), now = Date.now();
        for (const v of this.life.byId.values()) if (!v.dead && now - (v.sealWitnesses?.get(b.who) ?? -Infinity) <= S.MEMORY_MS) ids.add(v.id);
        b.witnesses = [...ids].slice(0, 120);
    }

    free(v) {
        if (v.dead || v.noWand || v.sleep || v.lev || v.carriedBy || v.stunT > 0 || v.fleeT > 0 || v.prep || v.cardilon || v.servantOf != null) return false;
        if (!v.foe) return true;
        const p = this.life._playerPos(v.foe);
        if (p && (Math.hypot(p.x - v.x, p.z - v.z) < 25 || this.life._sees(v, p))) return false;
        let others = 0;
        for (const w of this.life.byId.values()) if (w !== v && !w.dead && w.foe === v.foe) others++;
        return others >= 2;
    }

    update(dt) {
        if (this.game.authority === false || (this.scan -= dt) > 0) return;
        this.scan = 0.5;
        for (const b of this.game.death?.bodies.values() || []) {
            const worker = b.sealWorker && this.life.byId.get(b.sealWorker);
            if (b.sealWorker && (!worker || worker.dead || worker.soulTask?.body !== b.id)) { if (worker) worker.soulTask = null; delete b.sealWorker; }
            if (!sealable(b) || b.lev || b.sealWorker || !b.witnesses?.length || (b.claim?.until || 0) > Date.now()) continue;
            let chosen = null, distance = S.FIND;
            for (const id of b.witnesses) {
                const v = this.life.byId.get(id);
                if (!v || v.soulTask || !knowsSoulSeal(v) || v.mana < S.CREATE || (v.maxMana ?? v.mana) < S.RITE || !this.free(v)) continue;
                if (!this.life._sees(v, { x: b.x, y: b.y + 0.5, z: b.z })) continue;
                const d = Math.hypot(v.x - b.x, v.z - b.z);
                if (d < distance) { chosen = v; distance = d; }
            }
            if (chosen) this.assign(chosen, b);
        }
    }

    holdSavior(v, id) {
        for (const b of this.game.death?.bodies.values() || []) if (b.who === id && sealable(b) && b.witnesses?.includes(v.id) && Math.hypot(v.x - b.x, v.z - b.z) < S.FIND) return this.assign(v, b);
        return false;
    }

    assign(v, b) {
        if (!sealable(b) || !b.witnesses?.includes(v.id) || !knowsSoulSeal(v)) return false;
        v.soulTask = { body: b.id, mark: null, t: 0, walk: 0 };
        b.sealWorker = v.id;
        v.foe = null; v.grudge = null; v.hunt = null; v.practice = null; v.later = null; v.seated = false;
        v.fx &= ~(FX.SHIELD | FX.DOME); v.shieldT = v.domeT = 0;
        return true;
    }

    cancel(v) {
        const b = this.game.death?.bodies.get(v.soulTask?.body);
        if (b?.sealWorker === v.id) delete b.sealWorker;
        v.soulTask = null;
    }

    think(v, dt) {
        const task = v.soulTask;
        if (!task) return false;
        const g = this.game, b = g.death?.bodies.get(task.body);
        if (!sealable(b) || !this.free(v) || b.lev || (b.claim?.until || 0) > Date.now()) { this.cancel(v); return false; }
        if (task.mark) {
            const m = g.pentagranium?.marks.get(task.mark);
            if (!m || Math.hypot(b.x - m.x, b.z - m.z) > 2 || Math.abs(b.y - m.y) > 3) { this.cancel(v); return false; }
        }
        if (Math.hypot(v.x - b.x, v.z - b.z) > S.REACH || Math.abs(v.y - b.y) > 3) {
            task.t = 0; task.walk += dt;
            if (task.walk > 120) { this.cancel(v); return false; }
            this.life._goSpot(v, b.x, b.z, 3.5, dt, S.REACH - 0.3, b.y);
            this.life._ground(v); return true;
        }
        if (!task.mark) {
            if (v.mana < S.CREATE) { v.speed = 0; v.mode = 'idle'; this.life._ground(v); return true; }
            const m = this.draw(v, b);
            if (!m) { this.cancel(v); return false; }
            task.mark = m.id;
        }
        v.speed = 0; v.path = null; v.mode = 'cast'; v.castT = 0.3;
        this.life._ground(v);
        task.t += dt;
        if (task.t >= S.TIME && v.mana >= S.RITE && this.finish(b, v.id, task.mark)) {
            v.mana -= S.RITE; this.collect(v, b); this.cancel(v);
        }
        return true;
    }

    draw(v, b) {
        const g = this.game, pg = g.pentagranium;
        if (!pg) return null;
        const id = 'soul:' + b.id + ':' + Math.round(b.x * 2) + ':' + Math.round(b.z * 2);
        const old = pg.marks.get(id);
        if (old) return old;
        const y = g.collision?.groundAt?.(b.x, b.z, b.y + 0.15) ?? b.y;
        const m = pg._place(id, v.id, 'soulseal', b.x, y + 0.025, b.z, 3.5, v.yaw || 0, true);
        if (!m) return null;
        pg._permanent(m); v.mana -= S.CREATE;
        g.sync?.pentagram?.({ k: 'mark', id, by: v.id, pent: 'soulseal', x: m.x, y: m.y, z: m.z, r: m.r, rot: m.rot, perm: 1 });
        this.life._say(v, 'Эта тёмная сила больше не вернётся.', 3);
        return m;
    }

    finish(b, by, mark) {
        if (!sealable(b) || b.lev || (b.claim?.until || 0) > Date.now()) return false;
        const seal = { by, mark, at: Date.now() };
        this.game.death.sealBody(b, seal);
        this.game.sync?.net?.send({ t: 'sseal', id: b.id, seal }, true);
        const m = this.game.pentagranium?.marks.get(mark);
        if (m) this.game.pentagranium._useFx('life', m, true);
        return true;
    }

    collect(v, b) {
        const g = this.game, state = this.life.state(v.cs.def.id);
        const store = state.sealLoot || (state.sealLoot = {}), bag = store[v.id] || (store[v.id] = []);
        for (const uid of b.equipment?.items || []) {
            const L = g.items?.loose.get(uid);
            if (!L || L.lev || L.accio || L.asked || L.model.position.distanceToSquared(_at.set(b.x, b.y, b.z)) > 36) continue;
            bag.push(L.item); g.sync?.itemGone?.(uid); g.items.removeLoose(uid);
        }
        for (const id of b.equipment?.weapons || []) {
            const w = g.weapons?.byId.get(id);
            if (!w || w.holder || w.ritual || w.remoteTarget || w.position.distanceToSquared(_at.set(b.x, b.y, b.z)) > 36) continue;
            bag.push({ kind: 'weapon', id: w.id, type: w.type, magic: !!w.magic, bonus: w.bonus || 0, ench: w.ench });
            g.sync?.weaponGone?.(w); g.weapons.remove(w);
        }
    }

    takeLoot(v) {
        const store = this.life.state(v.cs.def.id).sealLoot;
        const loot = store?.[v.id] || [];
        if (store) delete store[v.id];
        return loot;
    }
}
