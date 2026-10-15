/**
 * VillagerFear.js — how the people of a castle and its village meet real danger
 * (the host runs it; guests see where the people go and hear what they shout).
 *
 * Danger.js says what counts as danger and how far it is noticed. Here every
 * person, on their own, judges what they see and hear and acts — once, with a
 * plan they keep (no running back and forth):
 *   - far off: they stop, look that way, ask what it was;
 *   - near: they shout and warn the people round them, mothers call their family,
 *     and they hide in the nearest whole house that is not on the danger's side
 *     (in through the door — it closes behind them — and away from the windows);
 *     a house burning or falling down, or none near: they run out of the gates,
 *     away from it;
 *   - right on them: they run straight away first, then decide;
 *   - the brave ones of a village fight a fire with buckets from the well;
 *   - after a calm while they look out of the door, and later come out and go
 *     back to what they did; the old are slower and wait longer.
 * Knights do not hide: they go to look (CastleLife), shout «В дома!», and never
 * walk into a fire or a castle coming down.
 *
 * «На кого и на что»: Danger.js PEOPLE / DANGERS (and tests/unit/danger.test.js).
 */

import * as THREE from 'three';
import { DANGERS, levelOf, worst, safeFrom, pickShelter, pickEscape, calmNeeded } from './Danger.js';
import { isWizSite } from './WizardLife.js';
import { GREY_HAIR } from '../entities/VillagerModel.js';

const SENSE = 0.5; // s between looks round
const RUN = 5.6, WALK = 2.3;
const MAX_DOUSERS = 4;
const FX_BUCKET = 2; // (bits of v.fx for a commoner, sent to guests: what is in the hands)
const _v = new THREE.Vector3();

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LINES = {
    what: ['Что это было?', 'Слышали? Грохнуло где-то...', 'Ой... что там такое?', 'Господи, что это?'],
    whatFire: ['Дымом пахнет...', 'Это что, пожар?', 'Смотрите, горит!'],
    hide: ['Прячьтесь в дома!', 'В дом, скорее!', 'Бегите в дома!', 'Спасайтесь, в дом!'],
    flee: ['Бегите из деревни!', 'К воротам! Бегом!', 'Дома горят — бегите!', 'Спасайтесь кто может!'],
    run: ['А-а-а!', 'Берегись!', 'Бежим!'],
    fire: ['Пожар! Пожар!', 'Горим!', 'Огонь! Воды сюда!'],
    spider: ['Паук! Огромный паук!', 'Чудище! Прячьтесь!'],
    zombie: ['Мертвецы идут!', 'Зомби! В дома!'],
    attacker: ['Он убивает людей! Бегите!', 'Убийца! Прячьтесь!'],
    ruin: ['Земля дрожит!', 'Всё рушится! Бегите!', 'Замок падает!'],
    knight: ['В дома! Прячьтесь!', 'Все по домам! Живо!', 'Уходите отсюда! Здесь опасно!'],
    elder: ['Ох, ноги мои старые...', 'Погодите меня!', 'Ох-ох... не поспеваю...'],
    mother: (n) => [`${n}! Домой, скорее!`, `${n}, ко мне! В дом!`, `${n}! Бегом домой!`],
    peek: ['Кажется, стихло...', 'Ушло вроде...', 'Тихо стало.', 'Неужто кончилось?'],
    out: ['Ну и страху натерпелись...', 'Пронесло...', 'Слава богу, живы.', 'Посмотрим, что там осталось...'],
    douse: ['Воды! Несите воду!', 'Тушим, тушим!', 'За вёдра, соседи!'],
    splash: ['Ещё ведро!', 'Лей сюда!', 'Не даём ему разойтись!'],
};

export class VillagerFear {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this.list = new Map(); // danger key -> {key, kind, x, y, z, r, by, born, until}
        this._t = 0; // own clock (s)
        this._senseT = 0;
        this._seq = 0;
    }

    get now() { return this._t; }

    // ------------------------------------------------------------ dangers
    /**
     * A danger happened / is going on (host). Polled ones (fire, the spider…) are
     * given a key and refreshed; one-off ones (a blast) live as long as they are feared.
     */
    add(kind, pos, { r = null, by = null, key = null, ttl = null } = {}) {
        if (!pos || !DANGERS[kind]) return null;
        const D = DANGERS[kind];
        const k = key || kind + ':' + (++this._seq);
        let z = this.list.get(k);
        const until = this._t + (ttl ?? D.fear);
        if (!z) { z = { key: k, kind, born: this._t, seen: new Map() }; this.list.set(k, z); } // (seen: who already met it, at what level)
        z.x = pos.x; z.y = pos.y ?? 0; z.z = pos.z; z.r = r ?? D.r; z.by = by; z.until = Math.max(z.until || 0, until);
        z.at = this._t; // (last time it was really there)
        return z;
    }

    /** Dangers near a point (alive now). */
    near(x, z, R) {
        const out = [];
        for (const d of this.list.values()) if (Math.abs(d.x - x) < R + d.r && Math.abs(d.z - z) < R + d.r) out.push(d);
        return out;
    }

    /** A deadly place to keep out of (an ongoing ruin, fire, falling stones): its radius, else 0. (knights) */
    keepOut(p) {
        let R = 0;
        for (const d of this.list.values()) {
            if (this._t - d.at > 4) continue; // (only what is going on right now)
            if (d.kind !== 'ruin' && d.kind !== 'fire' && d.kind !== 'fall' && d.kind !== 'blast' && d.kind !== 'circle' && d.kind !== 'inspirius') continue;
            if (Math.hypot(p.x - d.x, p.z - d.z) < d.r + 3) R = Math.max(R, d.r + 3);
        }
        return R;
    }

    /** When was the last danger in a castle's land (s ago; Infinity: never). */
    quietFor(cs) { return cs.dangerAt == null ? Infinity : this._t - cs.dangerAt; }

    // ------------------------------------------------------------- sensing
    _poll() {
        const g = this.game;
        // fire: burning blocks (houses, hay, trees) and burning trees, in clusters of ~6 m
        const F = g.fire;
        if (F) {
            const cl = new Map();
            for (const b of F.burningBlocks?.values() || []) {
                const k = Math.round(b.x / 6) + ',' + Math.round(b.z / 6);
                const c = cl.get(k) || cl.set(k, { x: 0, y: 0, z: 0, n: 0 }).get(k);
                c.x += b.x; c.y += b.L - 1; c.z += b.z; c.n++;
            }
            for (const { tree: t } of F.burningTrees || []) if (t.alive) this.add('fire', { x: t.x, y: 4, z: t.z }, { key: 'tree:' + t.index, ttl: 4, r: 4 });
            for (const [k, c] of cl) this.add('fire', { x: c.x / c.n, y: c.y / c.n, z: c.z / c.n }, { key: 'fire:' + k, ttl: 4, r: 3 + Math.min(4, c.n / 8) });
        }
        // «Let the Hellfire Come»: the blaze (mine and the others')
        const H = g.hellfire;
        if (H?.state?.c && H.state.R > 0.5) this.add('fire', H.state.c, { key: 'hell:me', ttl: 3, r: H.state.R + 2 });
        for (const [by, f] of H?.remote || []) if (f.c && f.R > 0.5) this.add('fire', f.c, { key: 'hell:' + by, ttl: 3, r: f.R + 2 });
        // «Total Destruction»: the ground shakes and rumbles before it all comes down
        for (const d of g.destruction?.list || []) if (!d.done) this.add('ruin', d.p, { key: 'ruin:' + (d.key || (d.key = ++this._seq)), ttl: d.collapsed ? 40 : 6, r: d.R, by: d.by });
        // «Circle Attack»: the wave all round the wizard; «Inspirius»: its ball flying, then the blast
        for (const d of g.circleAttack?.list || []) this.add('circle', d.p, { key: 'circle:' + (d.key || (d.key = ++this._seq)), ttl: 30, r: d.f.R, by: d.by });
        for (const o of g.inspirius?.orbs || []) this.add('inspirius', o.p, { key: 'insp:' + (o.key || (o.key = ++this._seq)), ttl: 4, r: 20, by: o.by });
        for (const b of g.inspirius?.blasts || []) this.add('inspirius', b.p, { key: 'inspb:' + (b.key || (b.key = ++this._seq)), ttl: 60, r: 60, by: b.by });
        // stones falling (a roof whose walls are gone)
        for (const p of g.falling?.pieces || []) {
            const c = p.fall.cells[0];
            if (c) this.add('fall', { x: c[0], y: c[1] - 1, z: c[2] }, { key: 'fall:' + (p.key || (p.key = ++this._seq)), ttl: 8, r: 3 });
        }
        // the giant spider, zombies (at night they come out)
        for (const s of g.spiders?.list || []) if (!s.dead && s.model) this.add('spider', s.model.position, { key: 'spider:' + s.id, ttl: 3 });
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying && z.group) this.add('zombie', z.group.position, { key: 'zombie:' + (z.id ?? (z._fid || (z._fid = ++this._seq))), ttl: 3 });
        // a player who attacks the people (the castle is after them), and fights going on
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            for (const [pid, until] of cs.hostile) {
                if (until < Date.now()) continue;
                const p = this.life._playerPos(pid);
                if (p) this.add('attacker', { x: p.x, y: p.y - 1.95, z: p.z }, { key: 'atk:' + pid, ttl: 3, by: pid });
            }
            for (const v of cs.active.values()) if (!v.dead && v.foe && v.role === 'knight' && v.mode === 'attack') this.add('fight', v, { key: 'fight:' + v.id, ttl: 3 });
        }
    }

    _sees(v, d) {
        // (a blast, a rumble, a scream are heard through walls; a fire, a spider, a fight must be seen)
        if (d.kind === 'blast' || d.kind === 'ruin' || d.kind === 'quake' || d.kind === 'fall' || d.kind === 'circle' || d.kind === 'inspirius') return true;
        const D = DANGERS[d.kind];
        const dist = Math.hypot(d.x - v.x, d.z - v.z);
        if (dist < D.hear + d.r) return true;
        if (dist > D.see + d.r) return false;
        return this.life._sees(v, { x: d.x, y: (d.y ?? v.y) + 1.5, z: d.z });
    }

    /** Can this person be frightened (and run by this system)? */
    _fearful(v) {
        if (v.dead || v.wizard || v.servantOf != null || v.handLink || v.lev || v.sleep) return false; // (asleep: NightLife wakes them first)
        if (v.foe || v.order) return false; // (in a fight / under the king's orders)
        return v.role !== 'knight';
    }

    update(dt) {
        this._t += dt;
        this._senseT -= dt;
        if (this._senseT > 0) return;
        this._senseT = SENSE;
        this._poll();
        for (const [k, d] of this.list) if (d.until < this._t) this.list.delete(k);
        if (!this.list.size) return;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake || isWizSite(cs.def)) continue;
            const def = cs.def;
            const here = this.near(def.x, def.z, def.zone + 40);
            if (!here.length) continue;
            // (the builders down tools; Rebuild.js waits for calm)
            if (here.some((d) => this._t - d.at < 2)) cs.dangerAt = this._t;
            for (const v of cs.active.values()) {
                if (v.dead) continue;
                const w = worst(v, here, (d) => this._sees(v, d));
                if (!w) continue;
                if (v.role === 'knight') { if (!v.sleep) this._knight(v, w); continue; }
                if (!this._fearful(v)) continue;
                this._feel(v, w, here);
            }
        }
    }

    // ------------------------------------------------------------ reacting
    _traits(v) {
        if (v.brave == null) {
            const s = v.entry.seed >>> 0;
            v.brave = ((s >>> 7) % 100) / 100;
            v.elder = v.model?.look?.hairColor === GREY_HAIR;
        }
    }

    /** A knight: shouts the people into the houses (once in a while); never hides. */
    _knight(v, w) {
        if (w.level < 2 || v.foe || w.danger.seen.has(v.id)) return;
        w.danger.seen.set(v.id, w.level);
        if ((v.warnedAt ?? -1e9) > this._t - 25) return;
        v.warnedAt = this._t;
        this.life._say(v, pick(LINES.knight));
        this._warn(v, w.danger, 22);
    }

    /** One person meets one danger at a level. */
    _feel(v, w, here) {
        this._traits(v);
        const F = v.fear;
        const d = w.danger;
        if (w.level >= 1 && F) F.lastT = this._t; // (still going on: no calming down yet)
        // (met already at this level: nothing new — no looking round again and again)
        if (!F && w.level <= (d.seen.get(v.id) || 0)) return;
        if (w.level > (d.seen.get(v.id) || 0)) d.seen.set(v.id, w.level);
        if (F && F.state === 'douse' && d.kind === 'fire' && w.level < 3) return; // (that is what they are fighting)
        if (F && w.level <= F.level && F.state !== 'look' && F.state !== 'peek') return; // (already doing something about it)
        if (F && F.state === 'peek' && w.level < 2) return;
        if (w.level === 1) {
            if (F) return;
            // a second thing heard soon after the first: it is serious — hide
            const again = v.heardAt != null && this._t - v.heardAt < 60 && v.heardKey !== d.key;
            v.heardAt = this._t; v.heardKey = d.key;
            if (!again) { this._look(v, d); return; }
            w = { ...w, level: 2 };
        }
        this._decide(v, w.level, d, here, true);
    }

    /** Far off: stop, turn to it, wonder. */
    _look(v, d) {
        v.fear = { state: 'look', level: 1, danger: d, t: 2.5 + Math.random() * 2.5, lastT: this._t, since: this._t };
        v.path = null;
        if (Math.random() < 0.6) this.life._say(v, pick(d.kind === 'fire' ? LINES.whatFire : LINES.what), 3);
    }

    /**
     * Near: a plan — hide in a house, or run away out of the village. Kept until the danger
     * comes to the place they go to (no running back and forth on every new bang).
     */
    _decide(v, level, d, here, shout = false, house = null) {
        const life = this.life, cs = v.cs, def = cs.def;
        const prev = v.fear;
        const F = v.fear = { state: 'run', level, danger: d, lastT: this._t, since: this._t, bad: prev?.bad || new Set(), t: 0 };
        v.path = null; v.seated = false; v.talking = 0; v.follow = null; v.investigate = null;
        this._dropBucket(v);
        // the king and his advisor: deeper into the castle (unless the castle itself comes down)
        if (v.role === 'king' || v.role === 'advisor') {
            const rooms = cs.graph.tagged('room').concat(cs.graph.tagged('keepIn'));
            let best = -1, bs = -Infinity;
            for (const id of rooms) {
                const n = cs.graph.nodes[id];
                if (!safeFrom(n, here, 12)) continue;
                const s = Math.min(...here.map((z) => Math.hypot(n.x - z.x, n.z - z.z)));
                if (s > bs) { bs = s; best = id; }
            }
            if (best >= 0 && level < 3) { F.state = 'keep'; life._goTo(v, best); if (shout && v.role === 'king') life._say(v, 'Стража! Ко мне!'); return; }
        }
        // right on it: straight away first (a few seconds), then a place to be
        if (level >= 3 && !house) {
            F.state = 'run';
            F.t = 1.5 + Math.random() * 1.5;
            F.to = pickEscape(v, [], here, 14);
            if (shout) life._say(v, pick(LINES[d.kind] || LINES.run));
            return;
        }
        // a whole house not on the danger's side (one's own is worth a few steps more)
        const H = def.houses || [];
        let hi = house;
        if (hi == null) {
            const opts = [];
            const R = 70;
            for (let i = 0; i < H.length; i++) {
                const h = H[i];
                if (!h.inside || F.bad.has(i) || Math.abs(h.inside.x - v.x) > R || Math.abs(h.inside.z - v.z) > R) continue;
                opts.push({ i, x: h.inside.x, z: h.inside.z, own: i === v.entry.home, broken: this._broken(h), burning: this._burning(h) });
            }
            hi = pickShelter(v, opts, here, { maxDist: v.elder ? 40 : 55 });
        }
        if (hi != null && hi >= 0 && H[hi]?.homeNode != null) {
            F.state = 'shelter'; F.house = hi;
            life._goTo(v, H[hi].homeNode);
            if (shout) this._shout(v, d, 'hide');
            this._family(v, hi, d, here);
            return;
        }
        // nowhere to hide: out of the gates / away from the village
        F.state = 'flee';
        const g2 = cs.graph, places = [];
        for (const t of ['gateOut', 'gateIn', 'field', 'pier', 'quay']) for (const id of g2.tagged(t)) places.push({ ...g2.nodes[id], node: id });
        const Z = def.zone + 18;
        for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) places.push({ x: def.x + sx * Z, z: def.z + sz * Z, node: -1 });
        const to = pickEscape(v, places, here, 40);
        F.to = to;
        const q = to.i >= 0 ? places[to.i] : null;
        if (q && q.node >= 0) life._goTo(v, q.node);
        else { const n = g2.nearest(to.x, v.y, to.z, 8); if (n >= 0 && Math.hypot(g2.nodes[n].x - to.x, g2.nodes[n].z - to.z) < 15) life._goTo(v, n); }
        if (shout) this._shout(v, d, 'flee');
    }

    _shout(v, d, how) {
        if ((v.screamAt ?? -1e9) > this._t - 6) return;
        v.screamAt = this._t;
        const k = d.kind === 'blast' || d.kind === 'quake' || d.kind === 'fight' || d.kind === 'fall' ? null : d.kind;
        const line = v.elder && Math.random() < 0.5 ? pick(LINES.elder) : pick(k && LINES[k] && Math.random() < 0.6 ? LINES[k] : LINES[how]);
        this.life._say(v, line);
        this._warn(v, d, 18);
    }

    /** The ones near hear the shout: they know too (a moment later). */
    _warn(v, d, R) {
        for (const o of v.cs.active.values()) {
            if (o === v || o.dead || !this._fearful(o) || (o.fear && o.fear.level >= 2)) continue;
            if (Math.hypot(o.x - v.x, o.z - v.z) > R) continue;
            o.warned = { danger: d, at: this._t + 0.3 + Math.random() * 0.7 };
        }
    }

    /** A mother (or anybody of the house) calls her family home with her. */
    _family(v, hi, d, here) {
        if (!v.entry.female || v.elder || hi !== v.entry.home) return;
        const fam = [...v.cs.active.values()].filter((o) => o !== v && !o.dead && o.entry.home === v.entry.home && this._fearful(o) && Math.hypot(o.x - v.x, o.z - v.z) < 40 && !(o.fear && o.fear.level >= 2));
        if (!fam.length) return;
        this.life._say(v, pick(LINES.mother(fam[0].name)));
        for (const o of fam) { this._traits(o); this._decide(o, 2, d, here, false, hi); }
    }

    /** A house's roof is gone (it fell or burnt): no place to hide. */
    _broken(h) {
        const t = this.game.world?.terrain?.data;
        if (!t) return false;
        const L = Math.round(h.inside.y + 1.5);
        for (const p of [h.inside, h.c || h.inside]) if (!t.solidIn(Math.round(p.x), Math.round(p.z), L + 2, L + 12)) return true;
        return false;
    }

    _burning(h) {
        const F = this.game.fire;
        if (!F?.burningBlocks?.size) return false;
        const c = h.c || h.inside;
        return F.burningAt({ x: c.x, y: h.inside.y + 2, z: c.z }, (h.r || 5) + 1);
    }

    // ------------------------------------------------------------- acting
    /** One step of a frightened person (from CastleLife._think). true: handled. */
    step(v, dt) {
        if (v.warned && !v.fear && this._fearful(v) && this._t >= v.warned.at) {
            const d = v.warned.danger;
            v.warned = null;
            this._traits(v);
            if (this.list.has(d.key)) this._decide(v, 2, d, this.near(v.cs.def.x, v.cs.def.z, v.cs.def.zone + 40), Math.random() < 0.4);
        }
        const F = v.fear;
        if (!F) return false;
        if (!this._fearful(v)) { this._end(v, false); return false; }
        const life = this.life;
        const calm = this._t - F.lastT;
        const need = calmNeeded(v.brave ?? 0.5, v.elder);
        const run = RUN * (v.elder ? 0.55 : 1);
        F.checkT = (F.checkT || 0) - dt;
        switch (F.state) {
            case 'look': {
                F.t -= dt;
                life._steer(v, F.danger.x, F.danger.z, 0, dt, 99); // (turned to it)
                v.speed = 0; v.mode = 'idle';
                if (F.t <= 0) this._end(v, false);
                break;
            }
            case 'run': {
                F.t -= dt;
                life._steer(v, F.to.x, F.to.z, run, dt, 0.5);
                v.mode = 'flee';
                if (F.t <= 0) this._decide(v, 2, F.danger, this.near(v.cs.def.x, v.cs.def.z, v.cs.def.zone + 40));
                break;
            }
            case 'keep':
            case 'shelter': {
                // the place still safe? (checked now and then; a new danger there: decide again)
                if (F.checkT <= 0) {
                    F.checkT = 1;
                    const h = F.state === 'shelter' ? v.cs.def.houses[F.house] : null;
                    const here = this.near(v.x, v.z, 80);
                    if (h && (this._burning(h) || this._broken(h) || !safeFrom(h.inside, here, 8))) { F.bad.add(F.house); this._decide(v, 2, F.danger, here); break; }
                    if (this._douse(v, here)) break;
                }
                if (v.path && v.pathI < v.path.length) {
                    life._followPath(v, dt, F.level >= 3 ? run : run * 0.85);
                    v.mode = F.level >= 3 ? 'flee' : 'run';
                } else if (F.state === 'shelter') { F.state = 'inside'; F.spot = this._spot(v); }
                else { F.state = 'hidden'; v.speed = 0; }
                break;
            }
            case 'inside': {
                // away from the windows: deeper in, turned from the door; still now
                if (F.spot) {
                    const d = life._steer(v, F.spot.x, F.spot.z, WALK * 0.6, dt, 0.35);
                    if (d < 0.5 || v.speed === 0) F.spot = null;
                    v.mode = v.speed > 0 ? 'walk' : 'idle';
                } else { v.speed = 0; v.mode = 'idle'; }
                v.house = F.house;
                if (calm > need.peek) { F.state = 'peek'; F.t = 5 + Math.random() * 4; F.said = false; }
                break;
            }
            case 'hidden': { // (the king in the keep, people out beyond the gates)
                v.speed = 0; v.mode = 'idle';
                life._steer(v, F.danger.x, F.danger.z, 0, dt, 99);
                if (calm > need.out) this._end(v, true);
                break;
            }
            case 'peek': {
                // to the door: a look outside
                const h = v.cs.def.houses[F.house];
                const door = { x: h.inside.x + (h.door.x - h.inside.x) * 0.45, z: h.inside.z + (h.door.z - h.inside.z) * 0.45 };
                const d = life._steer(v, door.x, door.z, WALK * 0.7, dt, 0.4);
                if (d < 0.6) {
                    life._steer(v, F.danger.x, F.danger.z, 0, dt, 99);
                    v.speed = 0;
                    if (!F.said) { F.said = true; if (Math.random() < 0.6) life._say(v, pick(LINES.peek), 3); }
                    F.t -= dt;
                }
                v.mode = v.speed > 0 ? 'walk' : 'idle';
                if (calm < 1) { F.state = 'inside'; F.spot = this._spot(v); break; } // (it is not over: back in)
                if (F.t <= 0 && calm > need.out) this._end(v, true);
                else if (F.t <= 0 && F.said) { F.state = 'inside'; F.spot = this._spot(v); F.lastPeek = this._t; }
                break;
            }
            case 'flee': {
                if (v.path && v.pathI < v.path.length) life._followPath(v, dt, run);
                else {
                    const d = life._steer(v, F.to.x, F.to.z, run, dt, 1);
                    if (d < 1.5 || v.speed === 0) { F.state = 'hidden'; v.path = null; }
                }
                v.mode = 'flee';
                if (F.checkT <= 0) {
                    F.checkT = 1;
                    // far enough already
                    if (safeFrom(v, this.near(v.x, v.z, 80), 30)) { F.state = 'hidden'; v.path = null; }
                }
                break;
            }
            case 'douse': this._douseStep(v, dt); break;
            default: this._end(v, false);
        }
        life._ground(v);
        return true;
    }

    /** A place inside a house away from the windows and the door. */
    _spot(v) {
        const h = v.cs.def.houses[v.fear.house];
        if (!h) return null;
        const c = h.c || h.inside;
        // (from the door side deeper in, a step off the middle)
        const k = 0.55 + Math.random() * 0.25;
        return { x: h.inside.x + (c.x - h.inside.x) * k * 2 + (Math.random() - 0.5) * 1.2, z: h.inside.z + (c.z - h.inside.z) * k * 2 + (Math.random() - 0.5) * 1.2 };
    }

    /** It is over: back to what they did. */
    _end(v, said) {
        this._dropBucket(v);
        v.fear = null;
        v.path = null;
        v.house = v.job === 'home' ? v.house : undefined;
        if (said && Math.random() < 0.5) this.life._say(v, pick(LINES.out), 3);
        if (v.job === 'wander') { v.goingHome = false; v.trips = Math.max(v.trips || 0, 1); v.waitT = 0; this.life._nextTrip(v); }
    }

    // -------------------------------------------------- fighting a fire
    /** A brave villager, a fire in the village and nothing worse about: buckets from the well. */
    _douse(v, here) {
        if ((v.brave ?? 0) < 0.55 || v.elder || (v.role !== 'farmer' && v.role !== 'builder')) return false;
        if (here.some((d) => d.kind !== 'fire' && this._t - d.at < 15)) return false;
        const fires = here.filter((d) => d.kind === 'fire' && this._t - d.at < 2);
        if (!fires.length) return false;
        const wells = v.cs.graph.tagged('well');
        if (!wells.length) return false;
        let n = 0;
        for (const o of v.cs.active.values()) if (o.fear?.state === 'douse') n++;
        if (n >= MAX_DOUSERS) return false;
        const well = wells.map((id) => v.cs.graph.nodes[id]).sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0];
        if (!fires.some((f) => Math.hypot(f.x - well.x, f.z - well.z) < 45)) return false;
        const F = v.fear;
        F.state = 'douse'; F.sub = 'toWell'; F.well = well; F.t = 0;
        this.life._goTo(v, wells.find((id) => v.cs.graph.nodes[id] === well));
        this.life._say(v, pick(LINES.douse));
        return true;
    }

    _douseStep(v, dt) {
        const life = this.life, F = v.fear, g = this.game;
        F.t += dt;
        const fire = () => {
            const B = g.fire?.burningBlocks;
            let best = null, bd = 40;
            for (const b of B?.values() || []) {
                const d = Math.hypot(b.x - v.x, b.z - v.z);
                if (d < bd && Math.hypot(b.x - F.well.x, b.z - F.well.z) < 50) { bd = d; best = b; }
            }
            return best;
        };
        // something worse than a fire: hide after all
        if (F.checkT <= 0) {
            F.checkT = 1;
            const here = this.near(v.x, v.z, 80);
            if (here.some((d) => d.kind !== 'fire' && this._t - d.at < 3)) { this._decide(v, 2, F.danger, here); return; }
        }
        switch (F.sub) {
            case 'toWell':
                if (v.path && v.pathI < v.path.length) { life._followPath(v, dt, RUN * 0.9); v.mode = 'run'; }
                else { const d = life._steer(v, F.well.x, F.well.z, WALK, dt, 1.2); if (d < 1.6 || F.t > 25) { F.sub = 'fill'; F.t = 0; } v.mode = v.speed > 0 ? 'walk' : 'idle'; }
                break;
            case 'fill':
                life._steer(v, F.well.x, F.well.z, 0, dt, 99);
                v.speed = 0; v.mode = 'work';
                if (F.t > 1.8) {
                    const b = fire();
                    if (!b) { this._dropBucket(v); this._end(v, true); return; }
                    this._takeBucket(v);
                    F.sub = 'toFire'; F.t = 0; F.target = b; v.path = null;
                }
                break;
            case 'toFire': {
                const b = F.target;
                const still = g.fire?.burningBlocks?.has(b.x + ',' + b.L + ',' + b.z);
                if (!still) { const nb = fire(); if (!nb) { this._dropBucket(v); this._end(v, true); return; } F.target = nb; }
                const d = life._steer(v, F.target.x, F.target.z, RUN * 0.8, dt, 2.4);
                v.mode = v.speed > 0 ? 'run' : 'idle';
                if (d < 2.8 || (F.t > 12 && d < 6)) { F.sub = 'throw'; F.t = 0; }
                else if (F.t > 20) { F.sub = 'toWell'; F.t = 0; v.path = null; this._dropBucket(v); }
                break;
            }
            case 'throw':
                life._steer(v, F.target.x, F.target.z, 0, dt, 99);
                v.speed = 0; v.mode = 'work';
                if (F.t > 0.7 && !F.thrown) {
                    F.thrown = true;
                    const p = _v.set(F.target.x, F.target.L - 1, F.target.z);
                    this.splash(p, 2.2);
                    g.sync?.villagerDouse?.([Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10], 2.2);
                    if (Math.random() < 0.3) life._say(v, pick(LINES.splash), 2.5);
                }
                if (F.t > 1.3) { F.thrown = false; this._dropBucket(v); F.sub = 'toWell'; F.t = 0; v.path = null; life._goTo(v, v.cs.graph.nearest(F.well.x, F.well.y, F.well.z)); }
                break;
        }
    }

    /** A bucket of water on a fire (every computer: the same fire goes out). */
    splash(p, r) {
        const g = this.game;
        g.fire?.douse?.(p, r);
        if (g.fx?.spark) for (let i = 0; i < 14; i++) g.fx.spark(_v.set(p.x + (Math.random() - 0.5) * r, p.y + 0.5 + Math.random(), p.z + (Math.random() - 0.5) * r), i % 2 ? 0x9fd8ff : 0xe6f6ff, 0.14, new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.6);
        const me = g.character?.group.position;
        if (me && Math.hypot(me.x - p.x, me.z - p.z) < 25) g.sound?.playSplash?.();
    }

    _takeBucket(v) {
        if (v.bucket) return;
        v.bucket = v.model.toolKind || 'none';
        v.model.setHeldTool('bucket');
        v.fx = (v.fx | 0) | FX_BUCKET;
    }

    _dropBucket(v) {
        if (!v.bucket) return;
        v.model.setHeldTool(v.bucket);
        v.bucket = null;
        v.fx = (v.fx | 0) & ~FX_BUCKET;
    }

    /** (guests) a commoner's hands: a bucket or their own tool. */
    applyFx(v, fx) {
        if (v.role === 'knight' || v.wizard) return;
        const want = fx & FX_BUCKET;
        if (want && !v.bucket) this._takeBucket(v);
        else if (!want && v.bucket) this._dropBucket(v);
    }

    /** Is this person frightened enough to refuse a hand / a talk? */
    scared(v) { return !!v.fear && v.fear.level >= 2; }

    /** (CastleLife) somebody saw a crime / was hurt: that player is a danger to them right now. */
    scare(v, kind, pos, by) {
        if (!this._fearful(v)) return;
        const d = this.add(kind, pos, { key: 'atk:' + by, by, ttl: 20 });
        this._traits(v);
        this._decide(v, levelOf(kind, Math.hypot(pos.x - v.x, pos.z - v.z)) >= 3 ? 3 : 2, d, this.near(v.x, v.z, 80), true);
    }

    clear() { this.list.clear(); }
}
