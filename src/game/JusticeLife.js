/**
 * JusticeLife.js — the guard carries out the king's law (Justice.js): an arrest (up to the man, the cuffs, led to the jail, handed over),
 * the jail itself (who sits there, who is let out), the search of a house (the things found are brought to the king).
 *
 * The jail is a PLACE, not a building the world builds: the door of the barracks (the guard's own house). The arrested are led there and
 * are gone from the castle's life (their number written in the castle's state `st.jail`); a prison is never empty — a few old
 * inmates sit there anyway — and those the king jailed are not necessarily the ones seen there (the author's wish: no deep dive).
 * The host does all of it (VillagerCommands.run 'justice:…' on the host); the king's guest sends the order.
 */

import { mark as markEmo } from './GestureLife.js';
import { ARREST_SAY, HANDED, WALK_SAY, protest, lock, unlock, newJail, isJailed, releaseLine, searchResult, RESIDENT_SAY, SEARCH_START, prisonLine } from './Justice.js';
import { yawTo, turnToward } from './FaceTarget.js';
import { rollHouseLoot } from './ItemTypes.js';
import * as THREE from 'three';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WALK = 2.3;
const _p = new THREE.Vector3();

export class JusticeLife {
    constructor(life) {
        this.life = life;
    }

    get game() { return this.life.game; }

    jailOf(cs, create = false) {
        const st = this.life.state(cs.def.id);
        if (!st.jail && create) st.jail = newJail();
        return st.jail || null;
    }

    isJailed(cs, idx) { return isJailed(this.life.state(cs.def.id).jail, idx); }

    /** Where the jail door is: the barracks door of the castle (else the keep's). */
    door(cs) {
        const g = cs.graph;
        for (const tag of ['barracksDoor', 'keepDoor', 'gateIn']) {
            const list = g.tagged(tag);
            if (list.length) { const n = g.nodes[list[0]]; if (n) return { x: n.x, y: n.y, z: n.z, node: list[0] }; }
        }
        return null;
    }

    // ------------------------------------------------------------------ the host: orders
    /** VillagerCommands.run 'justice:<what>' — the knight `v` is told. */
    run(v, what, a, me, by) {
        const life = this.life;
        if (what === 'arrest') {
            const p = a.foe ? life.byId.get(a.foe) : null;
            if (!p || p.dead || p === v || p.role === 'king') return false;
            if (p.cmd?.kind === 'captive' || this.isJailed(v.cs, p.idx)) return false;
            life.cmds._clear(v, true);
            v.cmd = { id: 'arrest', by, kind: 'arrest', foe: p.id, stage: 'go', t: 120, walkT: 0, said: 0, handT: 0 };
            return true;
        }
        if (what === 'search' || what === 'enter') return this._startSearch(v, a, by, what === 'enter');
        return false;
    }

    // ------------------------------------------------------------------ each frame (host)
    step(v, c, dt) {
        if (c.kind === 'arrest') return this._arrestStep(v, c, dt);
        if (c.kind === 'captive') return this._captiveStep(v, c, dt);
        if (c.kind === 'search') return this._searchStep(v, c, dt);
        return false;
    }

    _arrestStep(v, c, dt) {
        const life = this.life, cmds = life.cmds;
        const p = life.byId.get(c.foe);
        if (!p || p.dead || p.foe || c.t <= 0) { if (p?.cmd?.kind === 'captive') this._free(p); cmds.clear(v); return false; }
        c.t -= dt;
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (c.stage === 'go') {
            // up to him (the crowd keeps two bodies ~3 m apart: close enough is close enough)
            c.stuckT = v.speed < 0.2 && d < 7 ? (c.stuckT || 0) + dt : 0;
            if (d > 3.2 && c.stuckT < 0.8) {
                life._steer(v, p.x, p.z, WALK * 1.5, dt, 2.2);
                v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
                p.talking = Math.max(p.talking || 0, 0.5);
                life._ground(v);
                if ((c.walkT += dt) > 40) { cmds.clear(v); return false; }
                return true;
            }
            c.stage = 'cuff'; c.t2 = 1.7;
            life._say(v, pick(ARREST_SAY), 3.5);
            markEmo(p, 'arrest', 6);
            p.cmd = { id: 'captive', by: c.by, kind: 'captive', knight: v.id, t: 400, said: 0 };
            p.follow = null; p.order = null; p.path = null; p.investigate = null; p.seated = false;
            this._clang(p);
            return true;
        }
        if (c.stage === 'cuff') {
            c.t2 -= dt;
            v.speed = 0; v.mode = 'work';
            v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, p.x, p.z), dt * 8);
            if (c.t2 > 0.9 && !c.protested) { c.protested = true; life._say(p, protest(life.talk?.brain?.(p)?.character), 4); }
            life._ground(v);
            if (c.t2 <= 0) {
                c.stage = 'lead';
                c.door = this.door(v.cs);
                if (!c.door) { life._say(v, 'Некуда его вести: тюрьмы здесь нет.', 4); this._free(p); cmds.clear(v); return false; }
                c.walkT = 0; v.path = null;
            }
            return true;
        }
        if (c.stage === 'lead') {
            const door = c.door;
            c.node = door.node;
            const left = cmds._goStep(v, c, dt, WALK * 1.05, door.x, door.z, 1.8);
            if (left > 0 && c.walkT < 90) {
                v.mode = v.speed > 0 ? 'walk' : 'idle';
                life._ground(v);
                if ((c.said += dt) > 7 && p.cmd) { c.said = 0; life._say(p, pick(WALK_SAY), 3); }
                return true;
            }
            // at the door: handed over
            v.speed = 0; v.mode = 'idle';
            this._lockUp(v.cs, p, c.by);
            life._say(v, pick(HANDED), 4);
            cmds.clear(v);
            return false;
        }
        return false;
    }

    /** The prisoner: hands behind the back, walks after the knight (a step and a half behind him), says he is innocent. */
    _captiveStep(p, c, dt) {
        const life = this.life;
        const k = life.byId.get(c.knight);
        if (!k || k.dead || k.cmd?.kind !== 'arrest' || k.cmd.foe !== p.id) { this._free(p); return false; }
        c.t -= dt;
        p.mode = 'cuffed';
        if (k.cmd.stage === 'lead') {
            // behind him: the point a step and a half back along the way he faces
            const bx = k.x + Math.sin(k.yaw) * 1.7, bz = k.z + Math.cos(k.yaw) * 1.7;
            life._steer(p, bx, bz, WALK * 1.15, dt, 0.5);
            p.mode = 'cuffed';
        } else {
            p.speed = 0;
            p.yaw = turnToward(p.yaw, yawTo(p.x, p.z, k.x, k.z), dt * 5);
        }
        p.talking = 0;
        life._ground(p);
        if (c.t <= 0) { this._free(p); return false; }
        return true;
    }

    _free(p) {
        if (p.cmd?.kind === 'captive') p.cmd = null;
        p.mode = 'idle';
        if (!p.dead) this.life._say(p, pick(['Свобода!', 'Уф… отпустили.']), 3);
    }

    _clang(p) { this.game.sound?.playClang?.(0.4); void p; }

    /** He is handed over: written in the jail, out of the castle's life. */
    _lockUp(cs, p, by) {
        const jail = this.jailOf(cs, true);
        lock(jail, { idx: p.idx, name: `${p.title ? p.title + ' ' : ''}${p.name || ''}`.trim(), role: p.role }, Date.now());
        p.cmd = null;
        this.life._deactivate(p);
        this.life.rel?.dirty.add(cs.def.id);
        this.life.rel?.bump?.(p, by, { f: -6, s: -5 }, { show: false }); // (he will remember it, if let out)
        this.life._sendState?.(cs);
    }

    // ------------------------------------------------------------------ the jail
    /** Lets out: `names` (some) or all. They come out at the jail door; each says his piece by his nature. */
    release(cs, names = null, by = null) {
        const jail = this.jailOf(cs);
        if (!jail?.list.length) return [];
        const idxs = names ? jail.list.filter((j) => names.some((n) => j.name.toLowerCase().includes(String(n).toLowerCase()))).map((j) => j.idx) : null;
        const out = unlock(jail, idxs);
        const door = this.door(cs);
        out.forEach((j, i) => {
            if (!door) return;
            const v = this.life._activate(cs, j.idx, { x: door.x + (i % 3) * 1.2, y: door.y, z: door.z + Math.floor(i / 3) * 1.2 }, 'wander');
            if (!v) return;
            const r = releaseLine(this.life.talk?.brain?.(v)?.character, Math.random());
            if (by != null && this.life.rel) { this.life.rel._apply?.(v, by, { f: r.f, s: r.s }, false); }
            setTimeout(() => { if (!v.dead) this.life._say(v, r.line, 5); }, 1500 + i * 900);
        });
        this.life.rel?.dirty.add(cs.def.id);
        return out;
    }

    prisonReport(cs) { return prisonLine(this.jailOf(cs), (cs.def.x * 31 + cs.def.z * 17) | 0); }

    // ------------------------------------------------------------------ the search of a house
    _houseFor(cs, a, v) {
        const houses = cs.def.houses || [];
        if (a.house != null && houses[a.house]) return a.house;
        if (a.point) {
            let bi = -1, bd = 28;
            houses.forEach((h, i) => { const d = Math.hypot(h.c.x - a.point.x, h.c.z - a.point.z); if (d < bd) { bd = d; bi = i; } });
            if (bi >= 0) return bi;
        }
        let bi = -1, bd = 40;
        houses.forEach((h, i) => { const d = Math.hypot(h.c.x - v.x, h.c.z - v.z); if (d < bd) { bd = d; bi = i; } });
        return bi;
    }

    _startSearch(v, a, by, enter = false) {
        const cs = v.cs, h = this._houseFor(cs, a, v);
        const house = h >= 0 ? cs.def.houses[h] : null;
        if (!house) return false;
        this.life.cmds._clear(v, true);
        const target = house.homeNode != null ? house.homeNode : house.doorNode;
        v.cmd = { id: 'search_house', by, kind: 'search', stage: 'go', h, node: target, tx: house.inside?.x ?? house.c.x, tz: house.inside?.z ?? house.c.z, t: 150, walkT: 0, dwell: 0, enter, breakIn: !!a.breakIn, door: this._doorOf(cs, h) };
        this.life.alog?.decision(v, `${enter ? 'входит в дом' : 'обыскивает дом'} №${h}${a.breakIn ? ' (ломая дверь, если заперта)' : ''}; дверь ${this._doorOf(cs, h)?.id ?? 'не найдена'}, ${this._doorOf(cs, h)?.locked ? 'ЗАПЕРТА' : 'открыта'}`);
        return true;
    }

    /** The house's door and whether it is locked now: { id, d, x, z, locked, spelled, near } or null. */
    _doorOf(cs, h) {
        const g = this.game;
        for (const rec of g.houses?.active.values() || []) {
            if (rec.def !== cs.def || rec.i !== h || !rec.doorId) continue;
            const d = g.doors?.list.get(rec.doorId);
            const locks = g.locks;
            const spelled = !!locks?.spelled?.has(rec.doorId);
            const locked = spelled || (!!locks?.doorLocks?.get(rec.doorId) && !locks.picked.has(rec.doorId));
            return { id: rec.doorId, d, x: d?.x, z: d?.z, locked, spelled };
        }
        return null;
    }

    /** A locked door in the way of a knight told to go in: he asks (or, told «выломай», breaks it). → true while he is busy with it. */
    _doorStep(v, c, dt) {
        const door = this._doorOf(v.cs, c.h);
        if (!door || !door.locked || door.x == null) return false;
        const near = Math.hypot(door.x - v.x, door.z - v.z);
        if (near > 4.5) return false;
        const g = this.game;
        if (door.spelled) { this.life._say(v, 'Дверь заперта заклинанием — мне её не открыть. Нужна «Алохомора».', 5); this.life.alog?.decision(v, 'дверь заперта заклинанием Lock — отказ'); this.life.cmds.clear(v); return true; }
        if (!c.breakIn) {
            this.life._say(v, 'Дверь заперта, Ваше Величество. Выломать?', 5);
            this.life.alog?.decision(v, 'дверь заперта — спрашивает, ломать ли; жду приказа «выломай»');
            this.life.cmds.clear(v);
            return true;
        }
        c.knock = (c.knock || 0) + dt;
        v.speed = 0; v.mode = 'work'; v.yaw = Math.atan2(-(door.x - v.x), -(door.z - v.z));
        if (Math.floor(c.knock / 0.7) !== Math.floor((c.knock - dt) / 0.7)) g.sound?.playHammer?.({ x: v.x, y: v.y + 1.4, z: v.z }, 0.7);
        if (c.knock < 2.4) return true;
        g.locks?.picked?.add(door.id); // (broken open: it stays open for everybody)
        try { g.doors?.impulse?.(door.d, { x: v.x - door.x, y: 0, z: v.z - door.z }, 1.2); } catch (_) { /* ignore */ }
        this.life._say(v, 'Готово, дверь выломана!', 3);
        this.life.alog?.decision(v, 'выломал дверь по приказу');
        return false;
    }

    _searchStep(v, c, dt) {
        const life = this.life, cmds = life.cmds, house = v.cs.def.houses[c.h];
        if (!house) { cmds.clear(v); return false; }
        c.t -= dt;
        if (c.t <= 0) { cmds.clear(v); return false; }
        if (c.stage === 'go') {
            if (this._doorStep(v, c, dt)) return true;
            // (first to the door itself, then in: the straight way from the street ends at the wall beside the door)
            const dn = house.doorNode != null ? v.cs.graph.nodes[house.doorNode] : null;
            if (dn && !c.inDoor) {
                if (Math.hypot(dn.x - v.x, dn.z - v.z) > 1.6 && c.walkT < 50) { cmds._goStep(v, c, dt, WALK * 1.4, dn.x, dn.z, 1.2); v.mode = v.speed > 0 ? 'walk' : 'idle'; life._ground(v); return true; }
                c.inDoor = true;
            }
            const left = cmds._goStep(v, c, dt, WALK * 1.4, c.tx, c.tz, 2.2);
            if (left > 0 && c.walkT < 70) { v.mode = v.speed > 0 ? 'walk' : 'idle'; life._ground(v); return true; }
            if (c.enter) { life._say(v, pick(['Я внутри, Ваше Величество.', 'Вошёл. Что дальше?', 'Мы в доме.']), 4); life.alog?.decision(v, 'вошёл в дом'); for (const o of v.cs.active.values()) if (o.sleep && Math.hypot(o.x - house.c.x, o.z - house.c.z) < (house.r || 6) + 2) life.night?.wake?.(o, 'noise', v.id); cmds.done(v); return false; }
            c.stage = 'dwell'; c.dwell = 6.5 + Math.random() * 3;
            life._say(v, pick(SEARCH_START), 4);
            // the people of the house cry out
            const res = [...v.cs.active.values()].find((x) => !x.dead && x.entry?.home === c.h && x !== v && Math.hypot(x.x - house.c.x, x.z - house.c.z) < 25);
            for (const o of v.cs.active.values()) if (o.sleep && Math.hypot(o.x - house.c.x, o.z - house.c.z) < (house.r || 6) + 2) life.night?.wake?.(o, 'noise', v.id); // (nobody sleeps through a search)
            if (res) { life._say(res, pick(RESIDENT_SAY), 4); life.rel?.bump(res, c.by, { f: -5, s: -3 }, { show: false }); }
            return true;
        }
        if (c.stage === 'dwell') {
            c.dwell -= dt; v.speed = 0; v.mode = 'work'; life._ground(v);
            if (c.dwell > 0) return true;
            this._finishSearch(v, c, house);
            return true;
        }
        return false;
    }

    _finishSearch(v, c, house) {
        const life = this.life, items = this.game.items;
        const uids = [];
        for (const L of items?.loose?.values() || []) {
            const p = L.model.position;
            if (L.hover || L.away || L.item.shop || L.item.godGift) continue;
            if (Math.hypot(p.x - house.c.x, p.z - house.c.z) <= (house.r || 6) + 1 && Math.abs(p.y - v.y) < 6) uids.push(L.item.uid);
        }
        const r = searchResult(uids.length, Math.random(), { poor: !house.rich });
        if (r.stash && items) {
            // a stash under the floor: the house's loot (a hidden find), lying where the knight stands
            for (const it of rollHouseLoot(Math.random, !!house.rich).slice(0, 2)) {
                _p.set(v.x + (Math.random() - 0.5), v.y + 1, v.z + (Math.random() - 0.5));
                items.spawnLoose(it, _p, {});
                uids.push(it.uid);
            }
        }
        life._say(v, r.line, 6);
        const me = life._playerPos(c.by);
        life.cmds.clear(v);
        if (uids.length && me) life.cmds._fetch(v, 'bring', { uids: uids.slice(0, 8), dest: { kind: 'me' } }, me, { id: 'search_house', by: c.by, t: 150 });
    }
}
