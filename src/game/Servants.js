/**
 * Servants.js — creatures that obey a wizard.
 *
 *  - «Брейнрот» makes ANY creature a servant for a while: a zombie, an animal,
 *    a villager / a knight, a wizard of the castles, somebody's living tree.
 *  - The living tree of «Alive» is its caster's servant for as long as it lives.
 *  - A servant follows its master at a distance, guards them and fights their
 *    enemies (zombies near, and whoever attacks the master); «Атак» with the hand
 *    pointing at someone sends all the master's servants at that one.
 *
 * Creatures are named as in the duel: {k, id} with k 'z' zombie, 'a' animal,
 * 'v' villager, 't' living tree, 'p' player, 's' the spider.
 * The host decides (it moves the creatures); everybody sees a purple ring
 * over the servants.
 */

import * as THREE from 'three';

export const SERVANT = {
    TIME: 45000, // ms a «Брейнрот» lasts
    FOLLOW: 4.5, // m: it keeps this far from its master
    FAR: 9, // m: farther than this it runs back
    SEEK: 22, // m: enemies this near (to it or to its master) are fought
    ORDER: 70, // m: an «Атак» target farther than this is given up
    ORDER_TIME: 60000, // ms an «Атак» order stands
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * Where a servant goes (pure: positions are {x, z}).
 * @returns {{mode: 'strike'|'chase'|'follow'|'stay', x: number, z: number, d: number}}
 */
export function servantPlan(me, master, enemy, reach) {
    if (enemy) {
        const d = Math.hypot(enemy.x - me.x, enemy.z - me.z);
        if (d <= reach) return { mode: 'strike', x: enemy.x, z: enemy.z, d };
        // (stops at arm's length, not inside the enemy)
        const k = (d - reach * 0.8) / d;
        return { mode: 'chase', x: me.x + (enemy.x - me.x) * k, z: me.z + (enemy.z - me.z) * k, d };
    }
    if (!master) return { mode: 'stay', x: me.x, z: me.z, d: 0 };
    const d = Math.hypot(master.x - me.x, master.z - me.z);
    if (d <= SERVANT.FOLLOW + 0.5) return { mode: 'stay', x: me.x, z: me.z, d };
    // a place beside the master (not on top of them)
    const k = (d - SERVANT.FOLLOW) / d;
    return { mode: d > SERVANT.FAR ? 'chase' : 'follow', x: me.x + (master.x - me.x) * k, z: me.z + (master.z - me.z) * k, d };
}

export class Servants {
    constructor(game) {
        this.game = game;
        this.orders = new Map(); // master id -> {k, id, until}
        this._halos = new Map(); // creature -> ring mesh
        this._netSv = []; // (guests) [k, id, master] from the host
        this._t = 0;
    }

    get auth() { return this.game.authority; }

    // ------------------------------------------------------------ creatures
    /** The creature named {k, id} (alive), or null. */
    find(k, id) {
        const g = this.game;
        if (k === 'z') { const z = g.zombieById?.get(id); return z && !z.isDead && !z.isDying ? z : null; }
        if (k === 'a') { const a = g.animals?.byId.get(id); return a && !a.dead ? a : null; }
        if (k === 'v') { const v = g.castleLife?.byId.get(id); return v && !v.dead ? v : null; }
        if (k === 't') { const t = g.livingTrees?.byId.get(id); return t && !t.isDead ? t : null; }
        if (k === 's') { const s = g.spiders?.list.find((x) => x.id === id); return s && !s.dead ? s : null; }
        if (k === 'D') return g.dragons?.byId(id) || null; // (a dragon: servants fight it — «Брейнрот» never makes it one)
        if (k === 'p') {
            if (id === g.localId) return g.combat?.dead || g.isDeadLocal ? null : { isPlayer: true, local: true, position: g.character.group.position };
            const r = g.remotes?.get(id);
            return r && !r.dead ? { isPlayer: true, r, position: r.position } : null;
        }
        return null;
    }

    /** Where it stands (a shared vector: read it at once), or null. */
    pos(k, id, out = _v) {
        const c = this.find(k, id);
        if (!c) return null;
        if (k === 'v') return out.set(c.x, c.y, c.z);
        if (k === 'p') return out.copy(c.position);
        if (k === 's') return out.copy(c.model.position);
        return out.copy(c.group.position);
    }

    /** The master of a creature (null: nobody's). */
    masterOf(k, c) {
        if (!c) return null;
        if (k === 'z') return c.isThrall ? c.thrallOwner : null;
        if (k === 't') return c.master ?? null;
        return c.servantOf ?? null;
    }

    _masterPos(id) {
        const g = this.game;
        if (id == null) return null;
        if (id === g.localId || id === 'local') return g.isDeadLocal || g.combat?.dead ? null : g.character.group.position;
        const r = g.remotes?.get(id);
        return r && !r.dead ? r.position : null;
    }

    /** Every servant of `master`: [{k, id, c}]. */
    of(master) {
        const g = this.game;
        const out = [];
        for (const z of g.zombies || []) if (!z.isDead && z.isThrall && z.thrallOwner === master) out.push({ k: 'z', id: z.id, c: z });
        for (const a of g.animals?.list || []) if (!a.dead && a.servantOf === master) out.push({ k: 'a', id: a.id, c: a });
        for (const v of g.castleLife?.byId.values() || []) if (!v.dead && v.servantOf === master) out.push({ k: 'v', id: v.id, c: v });
        for (const t of g.livingTrees?.list || []) if (!t.isDead && t.master === master) out.push({ k: 't', id: t.id, c: t });
        return out;
    }

    /** Does `master` have anybody to send? (also asked on a guest: the host's list) */
    hasServants(master) {
        if (this.of(master).length) return true;
        return this._netSv.some((s) => s[2] === master) || !!this.game.livingTrees?.mine().length;
    }

    // ------------------------------------------------------------ «Брейнрот»
    /** (authority) The creature becomes `by`'s servant for SERVANT.TIME. */
    make(k, id, by) {
        const g = this.game;
        if (k === 'z') { g.applyBrainrot?.(id, by); return true; }
        const c = this.find(k, id);
        if (!c || k === 'p' || k === 's') return false;
        const until = performance.now() + SERVANT.TIME;
        if (k === 't') {
            if (c.owner === by && c.master === by) return false;
            c.master = by; c.masterUntil = until;
        } else {
            c.servantOf = by; c.servantUntil = until;
            if (k === 'a') { c.state = 'graze'; c.attacker = null; }
            if (k === 'v') { c.foe = null; c.fleeT = 0; c.fleeFrom = null; c.investigate = null; c.path = null; }
        }
        this._sparkle(this.pos(k, id), 24);
        return true;
    }

    _free(k, c) {
        if (k === 't') { c.master = c.owner; c.masterUntil = 0; return; }
        c.servantOf = null; c.servantUntil = 0;
        if (k === 'a') { c.state = 'graze'; c.target?.copy(c.group.position); }
    }

    /** «Атак»: all `master`'s servants go for this one. */
    command(master, target) {
        if (!target || target.k == null) return false;
        this.orders.set(master, { k: target.k, id: target.id, until: performance.now() + SERVANT.ORDER_TIME });
        return true;
    }

    // ------------------------------------------------------------- enemies
    /**
     * Whom a servant fights: its master's «Атак» target, else the nearest enemy
     * (a zombie that isn't anybody's servant, an animal / a villager / the spider
     * going for the master). {k, id, x, z} | null
     */
    enemyFor(self, master, me, seek = SERVANT.SEEK) {
        const g = this.game;
        const o = this.orders.get(master);
        if (o) {
            const p = performance.now() < o.until && !(o.k === self.k && o.id === self.id) ? this.pos(o.k, o.id) : null;
            const ally = p && this.masterOf(o.k, this.find(o.k, o.id)) === master;
            if (p && !ally && Math.hypot(p.x - me.x, p.z - me.z) < SERVANT.ORDER) return { k: o.k, id: o.id, x: p.x, z: p.z };
            if (!p || ally) this.orders.delete(master);
        }
        const mp = this._masterPos(master);
        let best = null, bd = Infinity;
        const consider = (k, id, p) => {
            if (k === self.k && id === self.id) return;
            const d = Math.hypot(p.x - me.x, p.z - me.z);
            const dm = mp ? Math.hypot(p.x - mp.x, p.z - mp.z) : Infinity;
            if (Math.min(d, dm) > seek) return;
            if (d < bd) { bd = d; best = { k, id, x: p.x, z: p.z }; }
        };
        for (const z of g.zombies || []) {
            if (z.isDead || z.isDying || (z.isThrall && z.thrallOwner === master)) continue;
            consider('z', z.id, z.group.position);
        }
        for (const a of g.animals?.list || []) {
            if (a.dead || a.servantOf === master) continue;
            if ((a.state === 'attack' && a.attacker === master) || (a.servantOf != null && a.servantOf !== master)) consider('a', a.id, a.group.position);
        }
        for (const v of g.castleLife?.byId.values() || []) {
            if (v.dead || v.servantOf === master) continue;
            if (v.foe === master || (v.servantOf != null && v.servantOf !== master)) consider('v', v.id, _v.set(v.x, v.y, v.z));
        }
        for (const s of g.spiders?.list || []) if (!s.dead && s.target === master) consider('s', s.id, s.model.position);
        for (const d of g.dragons?.list || []) if (!d.dead && d.target === master) consider('D', d.id, d.model.position);
        return best;
    }

    /**
     * (authority) What a servant does now: {mode, x, z, d, enemy} (see servantPlan),
     * or null when it isn't (or is no longer) anybody's servant.
     */
    plan(k, c, me, reach, seek) {
        const master = this.masterOf(k, c);
        if (master == null) return null;
        const until = k === 't' ? c.masterUntil : c.servantUntil;
        if (until && performance.now() > until) { this._free(k, c); if (k !== 't') return null; return this.plan(k, c, me, reach, seek); }
        const enemy = this.enemyFor({ k, id: c.id }, master, me, seek);
        const mp = this._masterPos(master);
        const plan = servantPlan(me, mp, enemy, reach);
        plan.enemy = enemy;
        plan.master = master;
        return plan;
    }

    // -------------------------------------------------------------- blows
    /** (authority) A servant's blow lands on {k, id}. */
    damage(target, dmg, dir, by, kind = 'servant') {
        const g = this.game;
        const c = this.find(target.k, target.id);
        if (!c) return;
        const d = dir || new THREE.Vector3(0, 0, 1);
        if (target.k === 'z') g.damageZombie(c, dmg, false, d.clone(), by);
        else if (target.k === 'a') g.animals.hit(c, dmg, d.clone(), by);
        else if (target.k === 'v') g.castleLife.hit(c, dmg, d.clone(), by);
        else if (target.k === 't') g.livingTrees.hit(c, dmg, kind, by);
        else if (target.k === 's') g.spiders.hit(c, dmg, 'melee');
        else if (target.k === 'D') g.dragons.hit(c, dmg, 'servant', by);
        else if (target.k === 'p') {
            if (c.local) this.hitMe(dmg, d, by, kind);
            else if (g.sync?.servantHit) {
                // (their computer moves their body and counts the damage — in Creative too: thrown back, no harm)
                g.sync.servantHit(target.id, dmg, d, by, kind);
                const p = _v.copy(c.r.character.group.position).add(_v2.set(0, 1.2, 0));
                for (let i = 0; i < 8; i++) g.fx?.spark(p, 0xff3030, 0.15, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.4);
                g.sound?.playHit?.();
            } else g.combat?.hitRemote?.({ id: target.id, damageCooldown: 0, group: c.r.character.group }, dmg, false);
        }
    }

    /** A servant's blow (a living tree's branch…) lands on me: thrown back; hurt where players can be hurt. */
    hitMe(dmg, dir, by, kind = 'servant') {
        const g = this.game;
        if (g.combat?.dead || g.isDeadLocal) return;
        const hurts = g.combat?.enabled || g.config?.mode !== 'creative';
        if (g.combat?.enabled) g.combat.damage(dmg, by, kind);
        else g.damageLocalPlayer?.(dmg);
        g.knockback?.add(_v.copy(dir).setY(0).normalize().multiplyScalar(7).setY(3));
        const who = kind === 'tree' ? '🌳 Живое дерево ударило вас веткой' : '🌀 Слуга ударил вас';
        g.hud?.setVoice?.(hurts ? `${who}: −${dmg}` : who, true);
    }

    // -------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        this._t += dt;
        // purple rings over the servants (as over a zombie of «Брейнрот»)
        const now = new Set();
        const mark = (c, pos, h) => {
            now.add(c);
            let ring = this._halos.get(c);
            if (!ring) {
                ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
                ring.rotation.x = Math.PI / 2;
                g.scene?.add(ring);
                this._halos.set(c, ring);
            }
            ring.position.set(pos.x, pos.y + h, pos.z);
            ring.rotation.z += dt * 2;
        };
        const sv = [];
        if (this.auth) {
            for (const a of g.animals?.list || []) {
                if (a.dead || a.servantOf == null) continue;
                if (a.servantUntil && performance.now() > a.servantUntil) { this._free('a', a); continue; }
                mark(a, a.group.position, 2.2 * (a.model?.scale?.y || 1)); sv.push(['a', a.id, a.servantOf]);
            }
            for (const v of g.castleLife?.byId.values() || []) {
                if (v.dead || v.servantOf == null) continue;
                if (v.servantUntil && performance.now() > v.servantUntil) { this._free('v', v); continue; }
                if (v.group?.visible !== false) mark(v, _v.set(v.x, v.y, v.z), 4.6); sv.push(['v', v.id, v.servantOf]);
            }
            this.netList = sv;
        } else {
            for (const [k, id] of this._netSv) {
                const c = this.find(k, id);
                if (!c) continue;
                if (k === 'a') mark(c, c.group.position, 2.2 * (c.model?.scale?.y || 1));
                else if (k === 'v') mark(c, _v.set(c.x, c.y, c.z), 4.6);
            }
        }
        for (const [c, ring] of this._halos) {
            if (now.has(c)) continue;
            g.scene?.remove(ring);
            ring.geometry.dispose(); ring.material.dispose();
            this._halos.delete(c);
        }
        for (const [m, o] of this.orders) if (performance.now() > o.until) this.orders.delete(m);
    }

    /** (guests) the host's servants: [[k, id, master], ...]. */
    applyNet(list) {
        this._netSv = Array.isArray(list) ? list.filter((s) => Array.isArray(s) && s.length >= 3) : [];
    }

    _sparkle(p, n) {
        const fx = this.game.fx;
        if (!p || !fx) return;
        for (let i = 0; i < n; i++) fx.spark(_v.set(p.x, p.y + 2.2, p.z), i % 2 ? 0xd65bff : 0xff7bff, 0.15, new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.7);
    }

    dispose() {
        for (const ring of this._halos.values()) { this.game.scene?.remove(ring); ring.geometry.dispose(); ring.material.dispose(); }
        this._halos.clear();
    }
}
