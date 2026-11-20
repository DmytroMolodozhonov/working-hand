/** Divine resurrection of an NPC's actual body. The host restores the person and consumes the remains. */
import * as THREE from 'three';
import { bodyStage } from './Death.js';

const RANGE = 22, GRACE = 9000;
const origin = new THREE.Vector3(), direction = new THREE.Vector3();
const target = new THREE.Vector3(), delta = new THREE.Vector3(), velocity = new THREE.Vector3();

export class Revivify {
    constructor(game) {
        this.game = game;
        this.pending = null;
        this.seq = 0;
        this.effects = [];
    }

    pick(from, dir) {
        let best = null, bestScore = Infinity;
        for (const b of this.game.death?.bodies.values() || []) {
            if (b.k !== 'v' || !b.who || b.lev || bodyStage(b.age) === 'gone') continue;
            target.set(b.x, b.y + .55, b.z);
            delta.copy(target).sub(from);
            const along = delta.dot(dir);
            if (along < -.3 || along > RANGE) continue;
            const miss = delta.addScaledVector(dir, -Math.max(0, along)).length();
            if (miss > 1.5 || miss + along * .035 >= bestScore) continue;
            if (this.game.collision?.lineOfSight && !this.game.collision.lineOfSight(from.x, from.y, from.z, target.x, target.y, target.z, .25)) continue;
            best = b;
            bestScore = miss + Math.max(0, along) * .035;
        }
        return best;
    }

    cast(final) {
        if (!final || this.pending) return null;
        const g = this.game;
        const side = g.wandSide() || [g.dom, g.off].find(s => s && g.character.isArmRaised(s));
        if (!side) return this._hint('Направьте руку или палочку на останки NPC');
        g.character.getHandDirection(side, direction).normalize();
        origin.copy(g.castOrigin(side));
        const b = this.pick(origin, direction);
        if (!b) return this._hint('В пределах досягаемости нет останков NPC');
        const why = g.combat.check('Revivify');
        if (why) return this._hint(why);
        if (g.authority !== false) {
            if (!this._revive(b)) return this._hint('Этого персонажа не удалось оживить');
            g.combat.pay('Revivify');
            this._effect([b.x, b.y, b.z]);
            g.sync?.net?.send({ t:'rvdone', id:b.id, p:[b.x,b.y,b.z] }, true);
            return 'Revivify';
        }
        const net = g.sync?.net;
        if (!net) return null;
        const req = ++this.seq;
        g._manaLater = true;
        g.combat.pay('Revivify');
        this.pending = { req, id: b.id, until: performance.now() + GRACE };
        net.send({ t:'rvask', req, id:b.id, side, o:origin.toArray(), d:direction.toArray() });
        return 'Revivify';
    }

    _revive(b) {
        const g = this.game;
        if (!g.castleLife?.reviveVillager(b)) return false;
        g.death.removeBody(b.id, false);
        return true;
    }

    onNet(m) {
        const g = this.game;
        if (m.t === 'rvask' && g.authority) {
            const by = m.from, remote = g.remotes?.get(by), b = g.death?.bodies.get(m.id);
            if (!remote || remote.dead || !Number.isSafeInteger(m.req)) return;
            const vector = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
            const at = remote.group.position;
            const valid = b && vector(m.o) && vector(m.d) && origin.fromArray(m.o).distanceTo(at) < 6
                && direction.fromArray(m.d).lengthSq() > .1 && this.pick(origin, direction.normalize()) === b;
            const ok = valid && this._revive(b);
            g.sync?.net?.send({ t:'rvdone', to:by, req:m.req, id:m.id, ...(ok ? {p:[b.x,b.y,b.z]} : {}) }, true);
        } else if (m.t === 'rvdone' && !g.authority) {
            if (Array.isArray(m.p)) {
                const body = g.death.bodies.get(m.id);
                const previous = body && g.castleLife?.byId.get(body.who);
                if (previous?.dead) g.castleLife._deactivate(previous);
                g.death.removeBody(m.id, false);
                this._effect(m.p);
            }
            if (!this.pending || m.to !== g.localId || m.req !== this.pending.req || m.id !== this.pending.id) return;
            this.pending = null;
            if (Array.isArray(m.p)) g.mana?.success('Revivify');
            else this._refused('Этого персонажа не удалось оживить');
        }
    }

    _refused(message) {
        this.game.combat._refund('Revivify');
        this._hint(message);
    }

    _hint(message) { this.game.hud?.setVoice?.(message, true); return null; }

    _effect(p) {
        const g = this.game;
        this.effects.push({ p, age: 0, tick: 0 });
        g.fx?.lightFlash?.(target.set(p[0], p[1] + 1.2, p[2]), 0xffe0a3, 3, .6, 12);
    }

    update(dt) {
        if (this.pending && performance.now() >= this.pending.until) {
            this.pending = null;
            this._refused('Не удалось подтвердить воскрешение');
        }
        const fx = this.game.fx;
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.age += dt;
            if (e.age > 1.2) { this.effects.splice(i, 1); continue; }
            if (e.age < e.tick) continue;
            e.tick = e.age + .035;
            const radius = 1.45 * (1 - e.age / 1.25);
            for (let j = 0; j < 4; j++) {
                const a = e.age * 12 + j * Math.PI / 2;
                target.set(e.p[0] + Math.cos(a) * radius, e.p[1] + .3 + e.age * 2.7, e.p[2] + Math.sin(a) * radius);
                velocity.set(-Math.cos(a) * .8, .8, -Math.sin(a) * .8);
                fx?.spark?.(target, j & 1 ? 0xffe0a3 : 0xfff7df, .13, velocity, .42);
            }
        }
    }
}
