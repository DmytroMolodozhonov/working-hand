/**
 * MonsterGrab.js — монстр пентаграммы берёт существ в лапу (`game.monsterGrab`; правила и числа — GrabRules.js).
 *
 *  Мой компьютер (я — монстр): пальцы каждой кисти (Character.getGripCurl) — сомкнулись на существе, которое в ладони, —
 *    хват (MonsterTransform._grabs спрашивает tryGrab раньше, чем ломать кусок постройки). Дальше: сжатие (squeezeOf — пальцы
 *    сверх «держу» до кулака этого игрока) уходит тому, кто ведёт тело; пальцы лапы ложатся на тело (setGrip: не сквозь);
 *    отпускание и бросок — ThrowModel.HandTrack (тот же путь, что у вещей: момент, где пальцы начали раскрываться, скорость кисти).
 *  Хост (жители, рыцари, волшебники, звери, зомби, моряки): тело в лапе у кисти монстра (своего или чужого — по его позе),
 *    само не ходит (`c.lev` — его системы ждут, как при «Левиосе»), не проходит сквозь стены и землю (lineOfSight шагами,
 *    выскользнуло — падает), барахтается и кричит; сжатие ранит по времени, до конца — раздавлено (кровь, хруст, тело
 *    «раздавлен»); брошенное / выпавшее летит как от «Левиосы» (Levitation.letGo → удары о землю, стены, существ).
 *  Держимый игрок: его собственный компьютер (Levitation.lifted с `paw`) — висит в лапе, вырывается сам за 5 с, сжатие ранит
 *    его там же, бросок — как бросок «Левиосой» (dropMe: полёт, удар, падение).
 *  Сеть — сообщение `mgr`: hold / ok / no / sq (сжатие, ладонь вверх) / let (отпустил, скорость) / end (вырвался, умер,
 *    выскользнуло) / crush (кровь и хруст у всех). Гости видят тело по снимкам хоста и сжатие — по `sq`.
 *
 * «А если» (CLAUDE.md): монстр замёрз / кончился / умер / вышел — dropAll (тела падают); держащий отключился — onLeave;
 *  существо убили в лапе — отпускается; две лапы — два тела, одно тело — одной лапой (`c.lev`); Империус, дуэль под куполом,
 *  всадник, сидящий — не берутся (GRAB_TARGETS); стена между ладонью и телом — не берётся; кисть потеряна камерой — держит.
 */

import * as THREE from 'three';
import { GRAB_RULES as R, GRAB_TARGETS, BODY_KG, BODY_LEN, grabVerdict, fits, squeezeOf, smoothSqueeze, squeezeStep, throwSpeed, choked, wizardFreeT, WIZ_FREE_SPELL, shownCurl, wrapOf, squashOf, sideIx, ixSide, GRAB_CRIES } from './GrabRules.js';
import { HandTrack } from './ThrowModel.js';
import { floorUnder } from './Levitation.js';
import '../core/FastMath.js'; // (Math.hypot без мусора)

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();
const SIDES = ['left', 'right'];
const r2 = (v) => Math.round(v * 100) / 100;
const pick = (l) => l[Math.floor(Math.random() * l.length)];

/** Кто это для таблицы GRAB_TARGETS (и для веса/длины тела). */
export function grabKind(ck, c) {
    if (ck === 'p') return 'player';
    if (ck === 'z') return 'zombie';
    if (ck === 'a') return c.type || 'animal';
    if (ck === 's') return c.role === 'skeleton' ? 'skeleton' : c.role === 'blackbeard' ? 'blackbeard' : 'sailor';
    if (c.wizard) return 'wizard';
    return c.role === 'knight' ? 'knight' : c.role === 'king' ? 'king' : 'villager';
}
/** Строка таблицы «кто/что» (животные — общая строка «animal»). */
const rowOf = (kind) => (GRAB_TARGETS[kind] ? kind : BODY_KG[kind] ? 'animal' : kind);

export class MonsterGrab {
    constructor(game) {
        this.game = game;
        this.mine = { left: null, right: null }; // (моя лапа) {k, id, q, sent, sentT, open, palm, pending, kind, kg}
        this.held = new Map(); // (хост) 'k:id' → {ck, c, by, side, q, sq, top, vel, prev, jerkT, freeT, sc, age, palm}
        this.seen = new Map(); // (гость) 'k:id' → {by, side, q} — только вид (сжатие)
        this._trk = { left: new HandTrack(), right: new HandTrack() };
        this._arm = { left: {}, right: {} };
        this._regrab = new Map(); // id → время, раньше которого его снова не схватить (вырвался)
        this._why = -1e9;
        this._clock = 0;
    }

    get auth() { return this.game.authority !== false; }
    /** Эта лапа держит существо. */
    holds(side) { return !!this.mine[side]; }

    // ================================================================ моя лапа

    /**
     * (MonsterTransform._grabs) Пальцы этой кисти только что сомкнулись: есть ли в ладони существо — тогда хват (true), иначе
     * лапа берёт кусок постройки, как раньше.
     */
    tryGrab(side) {
        const g = this.game, ch = g.character;
        if (this.mine[side] || !g.monster?.active) return false;
        const palm = ch.getHandWorldPosition(side, new THREE.Vector3());
        const k = (ch.size || 1) / R.SCALE;
        const best = this._nearest(palm, k);
        if (!best) return false;
        if (!best.ok) { this._say(`🐺 ${best.why}`); return true; } // (в ладони — то, что лапа не берёт: и куска постройки не ломать)
        const other = this.mine[side === 'left' ? 'right' : 'left'];
        if (other && other.k === best.ck && other.id === best.id) { this._say(`🐺 ${GRAB_TARGETS.held.why}`); return true; }
        const kind = best.kind;
        this.mine[side] = { k: best.ck, id: best.id, q: 0, raw: 0, sent: -1, sentT: 0, open: 0, palm: false, kind, kg: BODY_KG[kind] ?? 80, lastCurl: ch.getGripCurl(side), wrap: wrapOf(kind) };
        this._trk[side].reset(true);
        g.sound?.playGrab?.('grab', palm, 0.9);
        g.fx.shake = Math.max(g.fx.shake || 0, 0.18);
        const me = g.localId;
        if (best.ck === 'p') { this.mine[side].pending = true; g.sync?.monsterGrab?.({ e: 'hold', s: sideIx(side), k: 'p', id: best.id }); }
        else if (this.auth) {
            const why = this._take(best.ck, best.c, me, side);
            if (why) { this.mine[side] = null; this._say(`🐺 ${why}`); return true; }
        } else { this.mine[side].pending = true; g.sync?.monsterGrab?.({ e: 'hold', s: sideIx(side), k: best.ck, id: best.id }); }
        return true;
    }

    /** Что в ладони у `palm`: ближайшее существо {ck, id, c, kind, ok, why} или null. */
    _nearest(palm, k) {
        const g = this.game, col = g.collision;
        const reach = R.PALM_R * k;
        let best = null, bd = Infinity;
        const look = (ck, c, cx, feet, cz, h, r, kind) => {
            // расстояние от ладони до тела (вертикальный отрезок от ног до макушки), минус толщина тела
            const y = Math.max(feet, Math.min(feet + h, palm.y));
            const d = Math.hypot(cx - palm.x, y - palm.y, cz - palm.z) - r;
            if (d > reach || d >= bd) return;
            if (col?.lineOfSight && !col.lineOfSight(palm.x, palm.y, palm.z, cx, y, cz, 0.5)) return; // (стена между ладонью и телом)
            bd = d;
            best = { ck, c, id: c.id, kind, ok: true, why: null };
        };
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying) look('z', z, z.group.position.x, z.group.position.y - 1, z.group.position.z, 3.5, 0.5, 'zombie');
        for (const a of g.animals?.targets?.() || []) {
            const ab = g.duel?._animalBody?.(a), p = a.group.position;
            look('a', a, p.x, p.y, p.z, (ab?.y ?? 0.8) * 2, ab?.r || 1, a.type || 'animal');
        }
        for (const v of g.castleLife?.targets?.() || []) look('v', v, v.x, v.y, v.z, 3.5, 0.5, grabKind('v', v));
        for (const v of g.ships?.crew?.byId?.values?.() || []) if (!v.dead) { const o = v.overboard; look('s', v, o ? o.x : v.x, o ? o.y : v.y, o ? o.z : v.z, 3.5, 0.5, grabKind('s', v)); }
        for (const [id, r] of g.remotes || []) {
            if (r.dead || !r.character?.group) continue;
            const p = r.character.group.position, S = r.character.size || 1;
            look('p', { id }, p.x, p.y - 2 * S, p.z, 3.5 * S, 0.5 * S, (S > 2 ? 'monster' : 'player'));
        }
        // то, что лапа не берёт (только чтобы сказать почему)
        const no = (list, kind, h = 6, r = 2) => {
            for (const c of list || []) {
                if (c.dead || c.isDead) continue;
                const p = c.group?.position || c.model?.position || c.position;
                if (p) look('-', c, p.x, p.y - 1, p.z, h, r, typeof kind === 'function' ? kind(c) : kind);
            }
        };
        no(g.dragons?.targets?.(), 'dragon', 12, 6);
        no(g.spiders?.targets?.(), 'spider', 6, 5);
        no(g.iceCastle?.targets?.(), (c) => (c.type === 'queen' ? 'iceQueen' : c.type === 'monster' ? 'iceGiant' : 'snowman'), 6, 1.5);
        no(g.livingTrees?.targets?.(), 'tree', 10, 2);
        no(g.phoenixes?.targets?.(), 'phoenix', 2, 1);
        no(g.owls?.targets?.(), 'owl', 1.5, 0.6);
        no(g.canaries?.targets?.(), 'canary', 3, 1);
        no(g.gargoyles?.targets?.(), 'gargoyle', 3, 1.2);
        no(g.spencers?.targets?.(), 'spencer', 1, 0.5);
        no(g.ghosts?.targets?.(), 'ghost', 3.5, 0.8);
        no(g.customCreatures?.targets?.(), 'custom', 3, 1);
        if (!best) return null;
        const v = this._verdict(best.ck, best.c, best.kind);
        best.ok = v.ok; best.why = v.why;
        return best;
    }

    /** Можно ли взять это тело сейчас: {ok, why}. */
    _verdict(ck, c, kind) {
        const g = this.game;
        const row = grabVerdict(rowOf(kind));
        if (!row.ok) return row;
        if (ck === 'p') {
            const t = this._regrab.get(c.id);
            if (t && t > this._clock) return { ok: false, why: 'он только что вырвался — дайте ему отбежать' };
            return { ok: true, why: null };
        }
        if (c.lev || this._heldElsewhere(ck, c.id)) return grabVerdict('held');
        if (c.dead || c.isDead || c.isDying) return grabVerdict('dead');
        if (c.imp || c.possessed) return grabVerdict('imperius');
        if (c.arena) return grabVerdict('arena');
        if (c.rider || g.animals?.riding === c || c.cart || c.mount?.on) return grabVerdict('rider');
        if (c.seated || c.climb || c.carriedBy || c.plantHeld) return grabVerdict('seated');
        if (!fits(BODY_LEN[kind] ?? 3.5, g.character?.size || R.SCALE)) return { ok: false, why: 'не помещается в кулак' };
        return { ok: true, why: null };
    }

    _heldElsewhere(ck, id) { return this.held.has(ck + ':' + id); }

    /** (каждый кадр, пока я монстр и не во льду: MonsterTransform.update) Держу: сжатие, пальцы лапы, отпускание и бросок. */
    stepMine(dt) {
        const g = this.game, ch = g.character;
        const ps = g.poseSmoother, now = performance.now(), tt = ps?.eff > 0 ? ps.eff : now;
        const fresh = !!ps && ps.to !== this._lastTo; if (ps) this._lastTo = ps.to;
        for (const side of SIDES) {
            const M = this.mine[side];
            if (!M) continue;
            if (M.pending && (M.pendT = (M.pendT || 0) + dt) > 1.5) { this.mine[side] = null; this._clearGrip(side, M); continue; } // (ответа нет: старый клиент, связь)
            const lost = !!ch.handLost?.(side);
            const curl = lost ? M.lastCurl : ch.getGripCurl(side);
            M.lastCurl = curl;
            const arm = ch.armState(side, this._arm[side]);
            const hand = ch.getActiveHands?.()[side];
            const seen = !!hand && hand.group.visible && (hand._lost === undefined ? (ch.isHandTracked?.(side) ?? false) : !hand._lost);
            const tk = this._trk[side];
            tk.push({ t: tt, hand: arm.hand, world: ch.getHandWorldPosition(side, _a), yaw: ch.group.rotation.y, curl, seen, fresh, camMs: ps?.interval || 50 });
            // сжатие (кисть потеряна камерой — держит как было)
            if (!lost) M.raw = squeezeOf(curl, tk.closedRef);
            M.q = smoothSqueeze(M.q, M.raw, dt);
            // пальцы лапы ложатся на тело, сжатие вдавливает их глубже (не сквозь)
            if (hand?.setGrip) {
                const sc = shownCurl(curl, M.wrap, M.q), o = hand.gripOverride;
                if (o && o._mg) { o.curl = sc; o.thumb = Math.min(1, sc + 0.15); } // (тот же объект: без мусора каждый кадр)
                else { hand.setGrip(sc, 'ball'); if (hand.gripOverride) hand.gripOverride._mg = true; }
            }
            // ладонь вверх и раскрыта — сидит на ладони (пока ладонь не перевернут)
            const open = curl < R.OPEN && !lost;
            const palm = open && (arm.palmUp || 0) >= R.PALM_UP;
            if (palm !== M.palm) { M.palm = palm; M.sentT = 0; }
            // отпускание: настоящий бросок / разжатая рука (ThrowModel), или пальцы раскрыты так долго (запасной путь)
            const d = M.pending ? null : tk.decide({ t: tt, arm, weight: Math.min(3, M.kg / 60) });
            M.open = open && !palm ? M.open + dt : 0;
            if (!M.pending && !palm && (d?.act || M.open >= R.DROP_OPEN_T)) {
                const throwIt = d?.act === 'throw';
                const v = throwIt ? _b.set(d.v.x, d.v.y, d.v.z) : (d?.act ? _b.set(d.v.x, d.v.y, d.v.z) : _b.copy(ch.handVelocity?.[side] || _b.set(0, 0, 0)));
                const sp = throwIt ? throwSpeed(v.length(), M.kg) : Math.min(4, v.length());
                if (v.lengthSq() > 1e-6) v.setLength(sp); else v.set(0, 0, 0);
                this._let(side, v, throwIt);
                continue;
            }
            // сжатие — тому, кто ведёт тело
            M.sentT -= dt;
            if (M.pending) continue;
            if (Math.abs(M.q - M.sent) > 0.04 || (M.sentT <= 0 && M.q !== M.sent)) {
                M.sent = r2(M.q); M.sentT = 0.5;
                this._squeeze(g.localId, side, M.sent, M.palm, M.k === 'p' ? M.id : null);
            }
        }
    }

    /** Сжатие у того, кто ведёт тело (хост — сам; держимый игрок — свой компьютер) и у гостей (вид). */
    _squeeze(by, side, q, palm, to) {
        const g = this.game;
        if (this.auth) for (const e of this.held.values()) if (e.by === by && e.side === side) { e.q = q; e.palm = palm; }
        g.sync?.monsterGrab?.({ e: 'sq', s: sideIx(side), q, ...(palm ? { p: 1 } : null), ...(to ? { to } : null) });
    }

    /** Отпустил (или бросил) лапу `side`: `v` — скорость тела в мире. */
    _let(side, v, thrown) {
        const g = this.game, M = this.mine[side];
        if (!M) return;
        this.mine[side] = null;
        this._clearGrip(side, M);
        const at = g.character.getHandWorldPosition(side, _c);
        if (thrown && v.length() > 6) g.sound?.playThrow?.(v.length(), 'round', at);
        g.monster && (g.monster._grabCd = Math.max(g.monster._grabCd || 0, 0.5));
        const msg = { e: 'let', s: sideIx(side), v: [r2(v.x), r2(v.y), r2(v.z)], ...(thrown ? { th: 1 } : null), ...(M.k === 'p' ? { to: M.id } : null) };
        if (this.auth && M.k !== 'p') this._release(g.localId, side, v.clone());
        g.sync?.monsterGrab?.(msg);
    }

    _clearGrip(side, M) {
        // (пальцы лапы отпускают тело: хват снимается — хвата палочки у монстра нет, MonsterTransform._freeHands)
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.gripOverride?._mg) hand.setGrip?.(null);
    }

    /** Все лапы разжимаются (лёд, конец формы, смерть, выход): тела падают — без броска. */
    dropAll() {
        for (const side of SIDES) if (this.mine[side]) this._let(side, _b.set(0, 0, 0), false);
    }

    // ================================================================ хост: тело в лапе

    /** (хост) Взять тело `c` в лапу `side` монстра `by`. → причина отказа или null. */
    _take(ck, c, by, side) {
        const g = this.game;
        const kind = grabKind(ck, c);
        const v = this._verdict(ck, c, kind);
        if (!v.ok) return v.why;
        const ch = this._monsterChar(by);
        if (!ch) return 'нет лапы';
        const centre = this._centre(ck, c, _a), up = this._up;
        // (по сети лапа могла уйти: не дальше полутора ладоней)
        const palm = ch.getHandWorldPosition(side, _b);
        if (by !== g.localId && palm.distanceTo(centre) > R.PALM_R * ((ch.size || 1) / R.SCALE) * 1.8 + 3) return 'не дотянулся';
        if (ck === 's' && !c.overboard) c.overboard = { x: c.x, y: c.y, z: c.z, vy: 0, vx: 0, vz: 0, t: 0, wet: false };
        if (ck === 's') { c.overboard.vy = 0; c.overboard.vx = c.overboard.vz = 0; c.overboard.wet = false; c.mode = 'idle'; c.fs = null; c.busy = false; }
        c.lev = { by, side, paw: true, hold: 0, target: centre.clone(), vel: new THREE.Vector3(), top: centre.y - up, age: 0, lower: false, body: false };
        if (ck === 'a') { c.vel?.set(0, 0, 0); c.airborne = false; c.fly = null; }
        if (ck === 'z') { c.vy = 0; c.windVel = null; }
        if (ck === 'v') { c.vy = 0; c.mode = 'flail'; c.speed = 0; c.path = null; g.castleLife?.reportCrime?.(c, by, 'crime'); }
        const e = { ck, c, by, side, kind, q: 0, sq: {}, palm: false, age: 0, prev: centre.clone(), vel: new THREE.Vector3(), top: centre.y - up, jerkT: 0.2, jit: new THREE.Vector3(), sc: null };
        if (c.wizard) e.freeT = wizardFreeT(c.entry?.rank || c.rank || (c.elder ? 'elder' : 'novice'));
        this.held.set(ck + ':' + c.id, e);
        this._cry(e, true);
        g.castleLife?.alarm?.(centre, 'monster', by, 30); // (рыцари бегут, жители — прочь)
        g.sync?.monsterGrab?.({ e: 'ok', to: by, s: sideIx(side), k: ck, id: c.id, mb: by });
        return null;
    }

    /** Персонаж монстра `by` (мой или чужой — по его позе), пока он монстр. */
    _monsterChar(by) {
        const g = this.game;
        if (by === g.localId) return g.monster?.active ? g.character : null;
        const r = g.remotes?.get(by);
        if (!r || r.dead || !r.character || (r.character.size || 1) < 2.5 || performance.now() - (r.lastUpdate || 0) > 3000) return null;
        return r.character;
    }

    /** Середина тела → out; `this._up` — её высота над ногами. */
    _centre(ck, c, out) {
        const g = this.game;
        if (ck === 's' && g.levMax?.centre) this._up = g.levMax.centre('s', c, out);
        else if (g.levitation?._centre) this._up = g.levitation._centre(ck, c, out);
        else { out.set(c.x || 0, (c.y || 0) + 2.4, c.z || 0); this._up = 2.4; }
        return out;
    }

    _move(ck, c, d) {
        if (ck === 's') { const o = c.overboard; if (o) { o.x += d.x; o.y += d.y; o.z += d.z; } }
        else if (ck === 'v') { c.x += d.x; c.y += d.y; c.z += d.z; }
        else c.group.position.add(d);
    }

    _creature(ck, id) {
        const g = this.game;
        if (ck === 's') return g.ships?.crew?.byId?.get(id) || null;
        if (ck === 'z') return g.zombieById?.get(id) || null;
        if (ck === 'a') return g.animals?.byId?.get(id) || null;
        if (ck === 'v') return g.castleLife?.byId?.get(id) || null;
        return null;
    }

    /** (хост) Тело в лапе за кадр: к ладони (не сквозь стены и землю), барахтается, давится, вырывается. */
    _carry(e, dt) {
        const g = this.game, { ck, c } = e;
        if (c.dead || c.isDead || c.isDying || c.lev?.by !== e.by || !c.lev?.paw) { this._end(e, 'dead'); return; }
        const ch = this._monsterChar(e.by);
        if (!ch) { this._release(e.by, e.side, _b.set(0, 0, 0), e); return; } // (монстр ушёл, кончился, отключился — тело падает)
        e.age += dt;
        const k = (ch.size || 1) / R.SCALE;
        const centre = this._centre(ck, c, _a), up = this._up;
        // куда: перед ладонью (в кулаке) или на ладони (ладонь вверх, раскрыта)
        const palm = ch.getHandWorldPosition(e.side, _b);
        ch.getGripObject(e.side).getWorldQuaternion(_q);
        _n.set(0, 0, -1).applyQuaternion(_q); // (лицо ладони — её −Z: Character.armState)
        const want = _c.copy(palm).addScaledVector(_n, e.palm ? up + 0.2 : R.HOLD_OUT * k);
        if (e.palm) want.y = Math.max(want.y, palm.y + up);
        // барахтается: рывки в кулаке (тело дёргается на ладони, кулак держит)
        if ((e.jerkT -= dt) <= 0) {
            e.jerkT = R.JERK[0] + Math.random() * (R.JERK[1] - R.JERK[0]);
            e.jit.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar((e.palm ? 0.6 : 0.35) * (1 - 0.7 * e.q));
            if (Math.random() < 0.3) this._cry(e);
        }
        want.add(e.jit);
        // земля: ноги не ниже пола под ним
        const floor = floorUnder(g.collision, want.x, want.z, want.y);
        if (want.y - up < floor + 0.05) want.y = floor + up + 0.05;
        // стены: идёт к ладони, пока путь свободен (шагами), упёрлось — останавливается; слишком далеко от ладони — выскользнуло
        const got = this._free(centre, want);
        if (got.distanceTo(palm) > R.SLIP * k + up) { this._release(e.by, e.side, _b.copy(e.vel), e, 'slip'); return; }
        _b.subVectors(got, centre);
        this._move(ck, c, _b);
        e.vel.lerp(_b.divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 10));
        e.top = Math.max(e.top, got.y - up);
        c.lev.top = e.top; c.lev.vel.copy(e.vel);
        // смотрит на монстра, болтает ногами
        if (ck === 'v' || ck === 's') { c.yaw = Math.atan2(ch.group.position.x - got.x, ch.group.position.z - got.z) + Math.PI; c.speed = 0; c.mode = ck === 'v' ? 'flail' : 'idle'; }
        if (ck !== 's') g.levitation?._kicking?.(ck, c, dt);
        this._squash(e, e.q);
        // давит
        if (!e.palm && e.q > 0) {
            const r = squeezeStep(e.sq, e.q, dt);
            if (r.crush) { this._crush(e); return; }
            if (r.dmg > 0 && this._crush(e, r.dmg)) return; // (умер от сжатия — тоже раздавлен)
        } else e.sq.crushT = 0;
        // волшебник вырывается заклинанием, пока его не сдавили так, что нечем дышать
        if (e.freeT != null && !choked(e.q)) {
            e.freeT -= dt;
            if (e.freeT <= 0) {
                const rank = c.entry?.rank || c.rank || (c.elder ? 'elder' : 'adept');
                g.castleLife?._say?.(c, WIZ_FREE_SPELL[rank] || 'Остолбеней!', 3);
                for (let i = 0; i < 24; i++) g.fx?.spark?.(got, i % 2 ? 0xff5040 : 0xffe0a0, 0.12, _b.set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8), 0.6);
                g.sound?.playCrack?.(got, 0.8);
                this._release(e.by, e.side, _b.set(0, 0, 0), e, 'free');
            }
        }
    }

    /** Последняя свободная точка на пути от `a` к `b` (шагами, через Collision.lineOfSight). */
    _free(a, b) {
        const col = this.game.collision;
        const out = this._fp || (this._fp = new THREE.Vector3());
        if (!col?.lineOfSight || col.lineOfSight(a.x, a.y, a.z, b.x, b.y, b.z, 0.4)) return out.copy(b);
        let lo = 0, hi = 1;
        for (let i = 0; i < 7; i++) {
            const m = (lo + hi) / 2;
            out.lerpVectors(a, b, m);
            if (col.lineOfSight(a.x, a.y, a.z, out.x, out.y, out.z, 0.4)) lo = m; else hi = m;
        }
        return out.lerpVectors(a, b, lo * 0.95);
    }

    /** Тело сплющивается в кулаке (поперёк — уже, вдоль — чуть выше), отпустил — как было. */
    _squash(e, q) {
        const grp = e.ck === 'v' || e.ck === 's' ? e.c.model?.group : e.c.group;
        if (!grp) return;
        if (!e.sc) e.sc = grp.scale.clone();
        const s = squashOf(q);
        grp.scale.set(e.sc.x * s, e.sc.y * (1 + (1 - s) * 0.25), e.sc.z * s);
    }

    _unsquash(e) {
        const grp = e.ck === 'v' || e.ck === 's' ? e.c.model?.group : e.c.group;
        if (grp && e.sc) grp.scale.copy(e.sc);
        e.sc = null;
    }

    /** (хост) Сжатие ранит: урон по виду тела (вид «crush»: кости скелета ломаются, доспех держит часть). */
    _hurt(e, d) {
        const g = this.game, { ck, c } = e;
        if (ck === 'v') g.castleLife?.hit?.(c, d, null, e.by, { spell: true, kind: 'crush', hard: true });
        else if (ck === 's') g.ships?.crew?.hit?.(c, d, null, e.by, { spell: true, kind: 'crush' });
        else if (ck === 'a') g.animals?.hit?.(c, d, null, e.by);
        else if (ck === 'z') g.damageZombie?.(c, d, false, null, e.by);
        if (Math.random() < 0.35) g.sound?.playGrab?.('squeeze', this._centre(ck, c, _c), 0.5 + 0.5 * e.q);
        if (ck === 'v' && Math.random() < 0.4) this._cry(e);
    }

    /** (хост) Сжал до конца: раздавлен. Кровь, хруст, тело «раздавлен» (Death: `cr`), смерть от того, кто держал. */
    _crush(e, dmg = null) {
        const g = this.game, { ck, c } = e;
        const at = this._centre(ck, c, new THREE.Vector3()), up = this._up;
        const floor = floorUnder(g.collision, at.x, at.z, at.y);
        c.crushed = true; // (тело «раздавлен» — Death.villagerDied берёт `cr`)
        if (dmg != null) { // (сжатие ранит: умер от него — раздавлен, жив — нет)
            this._hurt(e, dmg);
            if (!(c.dead || c.isDead)) { c.crushed = false; return false; }
            this._end(e, null);
        } else {
            this._end(e, null); // (отпущен: его системы сами положат тело)
            // тело падает к полу под лапой (тело и кости лежат на земле, не в воздухе)
            this._move(ck, c, _b.set(0, floor - (at.y - up), 0));
            if (ck === 'v') g.castleLife?.hit?.(c, 9999, null, e.by, { spell: true, pierce: true, kind: 'crush', hard: true });
            else if (ck === 's') g.ships?.crew?.hit?.(c, 9999, null, e.by, { spell: true, pierce: true, kind: 'crush' });
            else if (ck === 'a') g.animals?.hit?.(c, (c.hp || 1) + 999, null, e.by);
            else if (ck === 'z') g.damageZombie?.(c, 9999, false, null, e.by);
        }
        if (dmg != null) { this._centre(ck, c, _c); this._move(ck, c, _b.set(0, floor - (_c.y - this._up), 0)); }
        if (ck === 'a' || ck === 'z') { const s = (c.group || c.model)?.scale; if (s) s.set(s.x * 1.15, s.y * 0.45, s.z * 1.15); } // (своя туша/тело остаётся у зверя и зомби — сплющенным)
        this.crushFx(at, e.by);
        g.sync?.monsterGrab?.({ e: 'crush', k: ck, id: c.id, p: [r2(at.x), r2(at.y), r2(at.z)] });
        if (e.by === g.localId) this.onEnd(e.side, 'crush');
        g.sync?.monsterGrab?.({ e: 'end', to: e.by, s: sideIx(e.side), k: ck, id: c.id, w: 'crush' });
        return true;
    }

    /** Кровь и хруст (на всех компьютерах). */
    crushFx(at, by) {
        const g = this.game;
        g.sound?.playGrab?.('crunch', at, 1);
        if (g.fx?.spark) for (let i = 0; i < 40; i++) g.fx.spark(at, i % 3 ? 0x8a0010 : 0xc01020, 0.14 + Math.random() * 0.1, _b.set((Math.random() - 0.5) * 7, Math.random() * 4 - 1, (Math.random() - 0.5) * 7), 0.9);
        if (g.fx?.debrisFrom) {
            const list = this._dl || (this._dl = []);
            list.length = 0;
            for (let i = 0; i < 12; i++) list.push({ x: at.x + (Math.random() - 0.5) * 1.2, y: at.y + (Math.random() - 0.5), z: at.z + (Math.random() - 0.5) * 1.2, color: i % 2 ? 0x6e0a10 : 0x9a1018, size: 0.2 + Math.random() * 0.2 });
            g.fx.debrisFrom(list, at, 20);
        }
        if (by === g.localId) g.fx.shake = Math.max(g.fx.shake || 0, 0.25);
    }

    /** (хост) Отпустил: тело летит со скоростью `v` (брошено) или выпадает; у самого пола — ставится на ноги. */
    _release(by, side, v0, only = null, why = null) {
        const g = this.game, v = (this._rv || (this._rv = new THREE.Vector3())).copy(v0);
        for (const e of only ? [only] : [...this.held.values()]) {
            if (e.by !== by || e.side !== side) continue;
            const { ck, c } = e;
            const centre = this._centre(ck, c, _a), up = this._up;
            const floor = floorUnder(g.collision, centre.x, centre.z, centre.y);
            const low = centre.y - up - floor < R.SET_DOWN_H * Math.max(0.5, (this._monsterChar(by)?.size || R.SCALE) / R.SCALE);
            this._end(e, why);
            if (c.dead || c.isDead) continue;
            if (low && v.length() < 4) { this._move(ck, c, _b.set(0, floor - (centre.y - up), 0)); continue; } // (поставил на ноги)
            c.lev = { by, side, vel: _b.copy(v).divideScalar(1.5), top: e.top, lower: false, body: false, paw: true }; // (Levitation.letGo: ×1,5)
            if (ck === 's') { if (g.levMax?._letBody) g.levMax._letBody({ ck, c }, false); else c.lev = null; }
            else if (g.levitation?.letGo) g.levitation.letGo(ck, c, false);
            else c.lev = null;
            if (ck === 'v' && v.length() > 8) g.castleLife?._say?.(c, pick(GRAB_CRIES.thrown), 2, true);
        }
    }

    /** (хост) Тело больше не в лапе. `why` — сказать монстру (вырвался / выскользнуло / умер); `quiet` — без сообщения, если сам отпустил. */
    _end(e, why) {
        const { ck, c } = e;
        this.held.delete(ck + ':' + c.id);
        this._unsquash(e);
        if (c.lev?.paw) c.lev = null;
        if (ck === 'v' && !c.dead) { c.mode = 'idle'; c.flyFlail = false; }
        if (why) {
            const g = this.game;
            if (e.by === g.localId) this.onEnd(e.side, why);
            g.sync?.monsterGrab?.({ e: 'end', to: e.by, s: sideIx(e.side), k: ck, id: c.id, w: why });
        }
    }

    /** Держимый кричит (жители, моряки; звери и зомби — своим видом). */
    _cry(e, first = false) {
        const g = this.game, { ck, c } = e;
        if (ck === 'v') {
            const list = c.wizard ? GRAB_CRIES.wizard : c.role === 'king' ? GRAB_CRIES.king : c.role === 'knight' ? GRAB_CRIES.knight : GRAB_CRIES.villager;
            g.castleLife?._say?.(c, pick(e.q > 0.4 ? GRAB_CRIES.squeezed : list), 2.2, true, first);
        } else if (ck === 's') g.ships?.crew?._say?.(c, pick(c.role === 'skeleton' ? GRAB_CRIES.skeleton : GRAB_CRIES.sailor), 2.2);
    }

    // ================================================================ я в чужой лапе (мой компьютер ведёт моё тело)

    /** Монстр `by` взял меня лапой `side`. */
    _heldMe(by, side) {
        const g = this.game, L = g.levitation;
        const no = (w) => g.sync?.monsterGrab?.({ e: 'no', to: by, s: sideIx(side), k: 'p', id: g.localId, w });
        if (g.combat?.dead || g.isDeadLocal) return no('мёртв');
        if (g.monster?.active) return no(GRAB_TARGETS.monster.why);
        if (L?.lifted) return no(GRAB_TARGETS.held.why);
        if (!this._monsterChar(by)) return no('нет лапы');
        g.flight?.busy && g.flight.land('monster');
        g.animals?.riding && g.animals.dismount?.();
        g.dragonRide?.busy && g.dragonRide.stop?.('stop');
        g.beds?.lying && g.beds.standUp?.();
        const p = g.character.group.position;
        L.lifted = { by, side, paw: true, hold: 0, target: p.clone(), vel: new THREE.Vector3(), top: p.y, age: 0, q: 0, sq: {}, free: R.PLAYER_FREE, palm: false, prev: p.clone() };
        L.fallTop = null;
        g.hud?.setVoice?.(`🐺 ${g.playerName?.(by) || 'Монстр'} схватил вас лапой! Вы вырываетесь…`, true);
        g.sync?.monsterGrab?.({ e: 'ok', to: by, s: sideIx(side), k: 'p', id: g.localId, mb: by });
    }

    /** (мой компьютер) Я в лапе: тело у её кисти, не сквозь стены; вырываюсь; сжатие ранит. */
    _stepMe(L, dt) {
        const g = this.game, ch = g.character;
        const mc = this._monsterChar(L.by);
        if (!mc) { this._dropMe(L, false, null, true); return; }
        L.age += dt;
        const k = (mc.size || 1) / R.SCALE, up = 2.0 + 0.6; // (моя середина над ногами — как у Levitation._updateLifted)
        const palm = mc.getHandWorldPosition(L.side, _b);
        mc.getGripObject(L.side).getWorldQuaternion(_q);
        _n.set(0, 0, -1).applyQuaternion(_q);
        const want = _c.copy(palm).addScaledVector(_n, L.palm ? up : R.HOLD_OUT * k);
        const p = ch.group.position;
        const cur = _a.set(p.x, p.y + 0.6, p.z);
        const floor = floorUnder(g.collision, want.x, want.z, want.y);
        if (want.y - up < floor + 0.05) want.y = floor + up + 0.05;
        const got = this._free(cur, want);
        if (got.distanceTo(palm) > R.SLIP * k + up) { this._dropMe(L, false, 'slip'); return; }
        _b.subVectors(got, cur);
        p.add(_b);
        L.vel.lerp(_b.divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 10));
        L.top = Math.max(L.top, p.y);
        ch.verticalVelocity = 0; ch.onGround = false;
        g.knockback?.set?.(0, 0, 0);
        // давит
        if (!L.palm && L.q > 0 && g.config?.mode !== 'creative') {
            const r = squeezeStep(L.sq, L.q, dt);
            if (r.crush) {
                const by = L.by;
                this._dropMe(L, false, null, true);
                const at = got.clone();
                L.done = true;
                this.crushFx(at, by);
                g.sync?.monsterGrab?.({ e: 'crush', k: 'p', id: g.localId, p: [r2(at.x), r2(at.y), r2(at.z)] });
                g.sync?.monsterGrab?.({ e: 'end', to: by, s: sideIx(L.side), k: 'p', id: g.localId, w: 'crush' });
                if (g.combat?.enabled) g.combat.die(by, 'crushed');
                else g.damageLocalPlayer?.(9999);
                return;
            }
            if (r.dmg > 0) { if (g.combat?.enabled) g.combat.damage(r.dmg, L.by, 'crush'); else g.damageLocalPlayer?.(r.dmg); }
            if (g.combat?.dead || g.isDeadLocal) return;
        }
        // вырываюсь сам (не навсегда)
        L.free -= dt * (choked(L.q) ? 0.5 : 1);
        if (L.free <= 0) { this._dropMe(L, false, 'free'); g.hud?.setVoice?.('🐺 Вы вырвались из лапы монстра!', true); }
    }

    /** Меня отпустили / я вырвался: падаю (Levitation.dropMe — полёт, удар, падение с высоты). */
    _dropMe(L, gentle, why, quiet = false) {
        const g = this.game, lev = g.levitation;
        L.done = true;
        if (lev.lifted !== L) return;
        lev.dropMe(gentle);
        if (!quiet) g.sync?.monsterGrab?.({ e: 'end', to: L.by, s: sideIx(L.side), k: 'p', id: g.localId, w: why || 'free' });
    }

    // ================================================================ каждый кадр, сеть

    update(dt) {
        this._clock += dt;
        const g = this.game;
        // (я монстр, но формы больше нет / лёд / смерть — MonsterTransform зовёт dropAll; на всякий случай)
        if (!g.monster?.active && (this.mine.left || this.mine.right)) this.dropAll();
        if (this.auth && this.held.size) for (const e of [...this.held.values()]) this._carry(e, dt);
        const L = g.levitation?.lifted;
        if (L?.paw) { this._myL = L; this._stepMe(L, dt); }
        // (меня отпустило не это: смерть от чужого заклинания, «стоп» — монстру сказать, что в лапе пусто)
        if (this._myL && g.levitation?.lifted !== this._myL) { const M = this._myL; this._myL = null; if (!M.done) g.sync?.monsterGrab?.({ e: 'end', to: M.by, s: sideIx(M.side), k: 'p', id: g.localId, w: 'dead' }); }
        if (this.seen.size) this._seenStep();
        if (this._regrab.size > 16) for (const [id, t] of this._regrab) if (t < this._clock) this._regrab.delete(id);
    }

    /** (гость) Сжатие тел в чужих лапах — только вид. */
    _seenStep() {
        for (const [key, s] of this.seen) {
            const c = this._creature(s.k, s.id);
            if (!c || c.dead || c.isDead) { if (c) this._unsquash(s); this.seen.delete(key); continue; }
            s.c = c; s.ck = s.k;
            this._squash(s, s.q);
        }
    }

    /** Монстру: тело больше не в лапе `side` (вырвалось, умерло, выскользнуло, раздавлено). */
    onEnd(side, why) {
        const M = this.mine[side];
        if (!M) return;
        this.mine[side] = null;
        this._clearGrip(side, M);
        if (M.k === 'p' && (why === 'free' || why === 'slip')) this._regrab.set(M.id, this._clock + R.REGRAB_CD);
        const g = this.game;
        const text = { free: 'вырвался из лапы', slip: 'выскользнул из лапы — мешает стена', crush: 'раздавлен', dead: 'умер в лапе' }[why];
        if (text && why !== 'dead') this._say(`🐺 ${M.k === 'p' ? g.playerName?.(M.id) || 'Игрок' : 'Он'} ${text}`);
        if (why === 'crush') g.fx.shake = Math.max(g.fx.shake || 0, 0.3);
    }

    /** (NetSync 'mgr') */
    onNet(m) {
        const g = this.game, me = g.localId, by = m?.by;
        if (!m || typeof m.e !== 'string' || by == null || by === me) return;
        const side = ixSide(m.s);
        const key = m.k + ':' + m.id;
        switch (m.e) {
            case 'hold':
                if (m.k === 'p') { if (m.id === me) this._heldMe(by, side); return; }
                if (!this.auth) return;
                {
                    const c = this._creature(m.k, m.id);
                    const why = c ? this._take(m.k, c, by, side) : 'его уже нет';
                    if (why) g.sync?.monsterGrab?.({ e: 'no', to: by, s: m.s, k: m.k, id: m.id, w: why });
                }
                return;
            case 'ok':
                if (m.to === me) { const M = this.mine[side]; if (M && M.k === m.k && M.id === m.id) M.pending = false; return; }
                if (!this.auth && m.k !== 'p') this.seen.set(key, { k: m.k, id: m.id, by: m.to, side, q: 0 });
                return;
            case 'no':
                if (m.to !== me) return;
                { const M = this.mine[side]; if (M && M.k === m.k && M.id === m.id) { this.mine[side] = null; this._clearGrip(side, M); if (m.w) this._say(`🐺 ${String(m.w).slice(0, 120)}`); } }
                return;
            case 'sq': {
                const q = Math.max(0, Math.min(1, +m.q || 0)), palm = !!m.p;
                if (this.auth) for (const e of this.held.values()) if (e.by === by && e.side === side) { e.q = q; e.palm = palm; }
                const L = g.levitation?.lifted;
                if (L?.paw && L.by === by && L.side === side) { L.q = q; L.palm = palm; }
                for (const s of this.seen.values()) if (s.by === by && s.side === side) s.q = q;
                return;
            }
            case 'let': {
                const v = Array.isArray(m.v) ? new THREE.Vector3(+m.v[0] || 0, +m.v[1] || 0, +m.v[2] || 0).clampLength(0, R.V_MAX) : new THREE.Vector3();
                if (this.auth) this._release(by, side, v);
                const L = g.levitation?.lifted;
                if (L?.paw && L.by === by && L.side === side) {
                    const p = g.character.group.position;
                    const low = p.y - 2 - floorUnder(g.collision, p.x, p.z, p.y) < R.SET_DOWN_H && v.length() < 4;
                    L.vel.copy(v).divideScalar(1.5);
                    this._dropMe(L, low, null, true);
                }
                for (const [k2, s] of this.seen) if (s.by === by && s.side === side) { if (s.c) this._unsquash(s); this.seen.delete(k2); }
                return;
            }
            case 'end':
                if (m.to === me) this.onEnd(side, m.w);
                { const s = this.seen.get(key); if (s) { if (s.c) this._unsquash(s); this.seen.delete(key); } }
                return;
            case 'crush':
                if (Array.isArray(m.p)) this.crushFx(_c.set(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0), by);
                return;
        }
    }

    /** Игрок ушёл: тела в его лапах падают; если он держал меня — падаю. */
    onLeave(id) {
        const g = this.game;
        for (const side of SIDES) if (this.auth) this._release(id, side, _b.set(0, 0, 0));
        const L = g.levitation?.lifted;
        if (L?.paw && L.by === id) this._dropMe(L, false, null, true);
        for (const side of SIDES) { const M = this.mine[side]; if (M?.k === 'p' && M.id === id) { this.mine[side] = null; this._clearGrip(side, M); } }
        for (const [k, s] of this.seen) if (s.by === id) { if (s.c) this._unsquash(s); this.seen.delete(k); }
    }

    _say(text) {
        const now = performance.now();
        if (now - this._why < 1500) return;
        this._why = now;
        this.game.hud?.setVoice?.(text, true);
    }

    dispose() {
        this.dropAll();
        for (const e of [...this.held.values()]) this._release(e.by, e.side, _b.set(0, 0, 0), e);
        this.seen.clear();
    }
}
