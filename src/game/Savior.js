/**
 * Savior.js — «Волшебник-спаситель» in the game (the rules, the numbers and the author's words: SaviorRules.js). `g.savior`.
 *
 *   host: every wizard killed by a player (CastleLife._die → `noteKill`) is counted; the 10th (later the 5th) within 2 minutes → a roll → the Saviour comes: a white
 *   wizard of his own place «ww<7000+n>_<stage>» (people: SaviorRules.saviorEntry — the same on a guest's computer), appears high up 38–60 m from the killer in a flash and
 *   comes down; he is after the killer (`v.foe`) and fights as the wizards do (WizardFight: duel spells, the dome «Protection Maxima», the wind, the blink) — only faster,
 *   hovering above the ground (`v.savior` → CastleLife._ground), with the BLUE spells only (the duel charge «Электром»; «Wind Maxima»; «Bombardo Maxima» / «Bombardo» when he sees the
 *   player use them — `noteSpell`, `_special`), and nothing else, nothing dark. Ten prepared lines — he despises killers.
 *   Beaten by the player: stage 1 (1500 mana) for good and two game days of peace; after them a new one comes only after FIVE wizards, and only by chance.
 *
 * «А если»: the killer dies / leaves the game / is far (FAR) / ten quiet minutes → he says a line, goes in a flash of light (no mercy given: he leaves, never forgives);
 * the killer is invisible → he knows where the player is (`_playerPos`), as any wizard of the world: a Saviour is not fooled by it; a Saviour already out → no second one;
 * a guest kills the wizards → the host counts them for his id, the Saviour comes at the guest; the host leaves → the Saviour is gone with the world (not saved);
 * night / sleep / school lesson / arena duel kills (`quietKill`, practice) are not counted; the game saved → the counters of the days and of the stages are kept.
 */
import * as THREE from 'three';
import { SAVIOR, STAGES, stageOf, GX0, KillWatch, saviorComes, saviorLine, pickSpecial, dangerNow } from './SaviorRules.js';
import { turnToward, yawTo, FACE } from './FaceTarget.js';
import { NPC_COST } from './WizardAI.js';
import { FX } from './WizardLife.js';

const DAY_S = 24 * 60; // s of game a game day (Bounty.js: Game.DAY_CYCLE_MS)
const _v = new THREE.Vector3();

export class Savior {
    constructor(game) {
        this.game = game;
        this.watch = new KillWatch();
        this.v = null; // the Saviour out now
        this.foe = null; // his player
        this.stage = new Map(); // player id → the stage of the next Saviour (0, then 1 for good)
        this.rest = new Map(); // player id → the game day (this.days) until which no Saviour comes
        this.days = 0; // game days passed (saved)
        this.n = 0;
        this.quiet = 0;
        this.lineT = 0;
        this.lastLine = null;
        this.said = { arrive: false, attack: false, hurt: false, dome: 0 };
        this.seen = new Map(); // player id → {spell: time (s) he last cast it}
        this.cd = {}; // his special spells' pauses
        this.air = null; // the flight (the insurance): {st: 'up'|'away'|'strafe'|'land', t, a (the angle round the foe)} — null: on the ground, fighting
        this.airCd = 0;
        this.hurtLog = []; // [time s, hp] — a burst of damage
        this.log = [];
    }

    get auth() { return this.game.authority !== false; }
    get life() { return this.game.castleLife; }
    /** A mistake in the Saviour's code never stops the game: it is written in the journal (once per kind) and he goes on. */
    _fail(where, e) {
        this._failed = this._failed || new Set();
        if (this._failed.has(where)) return;
        this._failed.add(where);
        console.error('[Savior]', where, e);
        this.game.perf?.note?.('⚠️ спаситель: ошибка в ' + where + ': ' + (e?.message || e));
    }
    _note(e) { this.log.push({ t: Math.round(performance.now() / 1000), ...e }); if (this.log.length > 40) this.log.shift(); }

    stageOf(id) { return stageOf(this.stage.get(id) || 0); }
    resting(id) { return this.days < (this.rest.get(id) || 0); }

    // ------------------------------------------------------------ the count (host)
    /** (CastleLife._die) A wizard `victim` died by `by`. */
    noteKill(by, victim) {
        const L = this.life;
        if (!this.auth || !L || by == null || !L._isPlayer(by) || !victim?.wizard || victim.savior != null) return;
        if (this.v && !this.v.dead) return; // (one at a time)
        if (this.resting(by)) return; // (two game days of peace after the beating)
        const now = performance.now() / 1000;
        if (this.watch.resting(by, now)) return;
        if (!this.watch.note(by, now, this.stageOf(by).kills)) return;
        if (!saviorComes()) { this._note({ ev: 'roll-no', by }); return; }
        this._spawn(by);
    }

    /** (Game.castLocalSpell / NetSync 'spell') A player cast `name`: a Bombardo is remembered — the Saviour answers with it when he sees it. */
    noteSpell(by, name) {
        if (!this.auth || by == null || (name !== 'Bombardo' && name !== 'BombardoMaxima')) return;
        let m = this.seen.get(by);
        if (!m) this.seen.set(by, m = {});
        m[name] = performance.now() / 1000;
    }

    // ------------------------------------------------------------ he comes
    _spawn(by) {
        const g = this.game, L = this.life, idx = L.index;
        if (!idx?.towers?.wanderDef) return false;
        const pp = L._playerPos(by);
        if (!pp) return false;
        const st = this.stageOf(by), t = g.world?.terrain?.data || g.terrain?.data;
        for (let k = 0; k < 12; k++) {
            const a = Math.random() * Math.PI * 2, d = SAVIOR.COME[0] + Math.random() * (SAVIOR.COME[1] - SAVIOR.COME[0]);
            const x = pp.x + Math.cos(a) * d, z = pp.z + Math.sin(a) * d;
            if (t?.landMade && !t.landMade(x, z)) continue; // (never the land made in the frame)
            const gy = g.collision?.groundY ? g.collision.groundY(x, z) : pp.y;
            if (!(gy > -1e4)) continue;
            const gx = GX0 + (this.n++);
            const def = idx.towers.wanderDef(gx, st.n, 'ww');
            def.x = x; def.z = z;
            const cs = L._runtime(def);
            const yaw = Math.atan2(-(pp.x - x), -(pp.z - z));
            const v = L._activate(cs, 1, { x, y: gy + SAVIOR.ARRIVE_H, z, yaw }, 'savior');
            if (!v) continue;
            this._prepare(v, st, by);
            this._note({ ev: 'come', by, stage: st.n });
            return true;
        }
        return false;
    }

    _prepare(v, st, by) {
        const g = this.game;
        this.air = null; this.airCd = SAVIOR.AIR_CD * 0.5; this.hurtLog.length = 0;
        this.v = v; this.foe = by; this.quiet = 0; this.lineT = 2.2; this.lastLine = null;
        this.said = { arrive: false, attack: false, hurt: false, dome: 0 };
        v.savior = st.n; v.fly = true; v.removable = false;
        v.maxHp = st.hp; v.hp = st.hp; v.maxArmor = st.ward; v.armor = st.ward;
        v.W = { ...v.W, hp: st.hp, ward: st.ward, mana: st.mana, dome: st.dome, stunK: SAVIOR.STUN_K, spells: SAVIOR.SPELLS };
        v.mana = v.maxMana = st.mana; v.castCd = 2; v.domeCd = 0;
        v.foe = by; v.grudge = { id: by, until: Date.now() + 3600e3 };
        this.life.wizards?.fx?.smoke?.(v);
        g.fx?.lightFlash?.(_v.set(v.x, v.y + 2, v.z), 0xfff6d8, 3, 0.8, 40);
        g.sound?.playSpellFxAt?.('fxLife', _v, 1, 1, 40);
    }

    // ------------------------------------------------------------ every frame (host)
    update(dt) {
        this.days += dt / DAY_S;
        try { this._update(dt); } catch (e) { this._fail('update', e); }
    }
    _update(dt) {
        const v = this.v;
        if (!v) return;
        if (!this.auth) return;
        if (v.dead || !this.life.byId.has(v.id)) { this._over(v); return; }
        const L = this.life, pp = L._playerPos(this.foe);
        this.lineT -= dt;
        if (!pp) { this._leave(v, 'win'); return; } // (the player is dead / gone: he has done what he came for)
        const d = Math.hypot(pp.x - v.x, pp.z - v.z);
        if (d > SAVIOR.FAR) { this._leave(v, 'leave'); return; }
        // the hunt: the foe is always his (a wizard's own fight does the rest); never anybody else
        if (!v.foe || v.foe !== this.foe) { v.foe = this.foe; v.grudge = { id: this.foe, until: Date.now() + 3600e3 }; }
        this.quiet = d < 40 && (v.hurtAt && Date.now() - v.hurtAt < 20000 || v.prep || v.castT > 0) ? 0 : this.quiet + dt;
        if (this.quiet > SAVIOR.QUIET_S) { this._leave(v, 'leave'); return; }
        // the words
        if (this.lineT <= 0) {
            let kind = null;
            if (!this.said.arrive && d < 80) { kind = 'arrive'; this.said.arrive = true; }
            else if (!this.said.attack && v.castT > 0) { kind = 'attack'; this.said.attack = true; }
            else if (!this.said.hurt && v.hp < v.maxHp * 0.6) { kind = 'hurt'; this.said.hurt = true; }
            else if ((v.fx & FX.DOME) && !this.said.dome) { kind = 'dome'; this.said.dome = 1; }
            else if (v.castT > 0 && Math.random() < 0.012) kind = 'attack';
            if (kind) { const s = saviorLine(kind, this.lastLine); if (s) { this.lastLine = s; L._say(v, s, 4); this.lineT = SAVIOR.LINE_GAP_S; } }
        }
        if (!(v.fx & FX.DOME)) this.said.dome = 0;
        this._diagT = (this._diagT || 0) - dt; // (a line in the journal every 8 s: where he is and what he does — to see at once if he stands aside)
        if (this._diagT <= 0) { this._diagT = 8; this.game.perf?.note?.(`🤍 спаситель: до цели ${Math.round(d)} м, foe ${v.foe != null}, режим ${v.mode}, мана ${Math.round(v.mana)}, перерыв ${(v.castCd || 0).toFixed(1)}, высота ${Math.round(v.y)}, воздух ${this.air?.st || '-'}, роль боя ${v.engage?.role || '-'}`); }
        this._special(v, pp, d, dt);
    }

    /** His own attack spells (not duel charges): the wind, the blasts — begun like any of his casts (the second to say it, then it flies: WizardFight._begin → _castSpecial). */
    _special(v, pp, d, dt) {
        for (const k of Object.keys(this.cd)) this.cd[k] -= dt;
        if (v.prep || v.noWand || v.dead || v.stunT > 0 || v.vy || v.lev || v.castT > 0 || (v.fx & FX.DOME)) return;
        const now = performance.now() / 1000, m = this.seen.get(this.foe) || {};
        const seen = {};
        for (const n of ['Bombardo', 'BombardoMaxima']) seen[n] = m[n] != null ? now - m[n] : null;
        let crowd = 1; for (const [, r] of this.game.remotes || []) if (r.position && !r.dead && Math.hypot(r.position.x - pp.x, r.position.z - pp.z) < 18) crowd++;
        const spell = pickSpecial({ seen, cd: this.cd, dist: d, mana: v.mana, crowd });
        if (!spell) return;
        const fp = { x: pp.x, y: pp.y - 0.4, z: pp.z }; // (the chest: the hero's group is higher than his feet)
        if (!this.life.wizards?.fight?.clearShot?.(v, fp)) return;
        const F = this.life.wizards.fight;
        if (F._begin(v, spell, this.foe, fp, { cost: NPC_COST[spell], cd: 1.2 })) this.cd[spell] = SAVIOR.SPECIAL_CD[spell];
    }

    // ------------------------------------------------------------ the flight (CastleLife._think calls it before the wizard's own fight)
    /** (host, every frame) True: the flight leads him now (the fight's own code is skipped). */
    drive(v, dt) {
        try { return this._drive(v, dt); } catch (e) { this._fail('drive', e); this.air = null; return false; }
    }
    _drive(v, dt) {
        if (v !== this.v || !this.auth || v.dead) return false;
        if (v.stunT > 0 || v.vy || v.lev || v.carriedBy) return false; // (thrown / stunned: the ordinary code — never a hovering stunned man)
        const L = this.life, g = this.game, F = L.wizards?.fight, W = v.W || {};
        const pp = L._playerPos(this.foe);
        if (!pp) return false;
        const now = performance.now() / 1000;
        // the ground: a danger? (the damage of the last seconds, health, mana)
        if (!this.air) {
            // not standing aside: the foe is far — he flies to him at once (low, fast), the fight itself begins when he is near
            const hd = Math.hypot(pp.x - v.x, pp.z - v.z);
            if (hd > SAVIOR.HELP_FROM && !v.prep && !(v.castT > 0)) {
                const c = g.collision, gy = c.groundAt ? c.groundAt(v.x, v.z, v.y + 1.1) : c.groundY(v.x, v.z);
                const mx = (pp.x - v.x) / hd, mz = (pp.z - v.z) / hd, sp = SAVIOR.AIR_SPEED, nx = v.x + mx * sp * dt, nz = v.z + mz * sp * dt;
                if (!c.pointBlocked?.(nx, v.y + 2, nz)) { v.x = nx; v.z = nz; } else v.y += 6 * dt; // (a wall / a hill: up over it)
                v.y += (gy + SAVIOR.FLY_H + 2 - v.y) * Math.min(1, dt * 2.5);
                v.yaw = yawTo(v.x, v.z, pp.x, pp.z); v.speed = Math.min(sp, 8); v.mode = 'run';
                return true;
            }
            this.airCd -= dt;
            this.hurtLog.push([now, v.hp]);
            while (this.hurtLog.length > 2 && now - this.hurtLog[0][0] > SAVIOR.BURST_S) this.hurtLog.shift();
            const lost = Math.max(0, this.hurtLog[0][1] - v.hp) / (v.maxHp || 1);
            if (dangerNow({ hpK: v.hp / (v.maxHp || 1), manaK: v.mana / (v.maxMana || 1), burst: lost }) && (this.airCd <= 0 || v.hp < v.maxHp * SAVIOR.DANGER_HP * 0.6)) {
                this.air = { st: 'up', t: 0, a: Math.random() * 6.28 };
                this.hurtLog.length = 0;
                this.said.fly = true;
                const s = saviorLine('fly', this.lastLine); if (s) { this.lastLine = s; L._say(v, s, 4); this.lineT = SAVIOR.LINE_GAP_S; }
                g.fx?.lightFlash?.(_v.set(v.x, v.y + 2, v.z), 0xfff6d8, 2, 0.5, 30);
                this._note({ ev: 'fly-up', hp: Math.round(v.hp) });
            } else return false;
        }
        const A = this.air;
        A.t += dt;
        // the common upkeep (the wizard's own think() is skipped while he flies)
        if (W.regen) v.mana = Math.min(v.maxMana, v.mana + W.regen * dt);
        v.castCd -= dt; v.domeCd -= dt; v.windCd -= dt; v.blinkCd -= dt;
        v.shieldT = (v.shieldT || 0) - dt; v.domeT = (v.domeT || 0) - dt; v.castT = (v.castT || 0) - dt;
        if (v.shieldT <= 0) v.fx &= ~FX.SHIELD;
        const c = g.collision, gy = c.groundAt ? c.groundAt(v.x, v.z, v.y + 1.1) : c.groundY(v.x, v.z);
        const dx = pp.x - v.x, dz = pp.z - v.z, d = Math.hypot(dx, dz) || 1;
        let targetY = gy + SAVIOR.SKY_H, moveX = 0, moveZ = 0, speed = 0;
        const face = (x, z) => { v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, x, z), FACE.WIZARD_TURN * dt); };
        if (A.st === 'up') {
            v.speed = 0; v.mode = 'idle'; face(pp.x, pp.z);
            if (A.t >= SAVIOR.UP_T) { A.st = 'away'; A.t = 0; }
        } else if (A.st === 'away') {
            moveX = -dx / d; moveZ = -dz / d; speed = SAVIOR.AIR_SPEED;
            v.yaw = yawTo(v.x, v.z, v.x + moveX, v.z + moveZ);
            v.hp = Math.min(v.maxHp, v.hp + SAVIOR.AIR_REGEN * dt);
            if (d >= SAVIOR.AWAY[0] || A.t >= SAVIOR.AWAY[1]) { A.st = 'strafe'; A.t = 0; A.bomb = 1.2; }
        } else if (A.st === 'strafe') {
            // round the foe at STRAFE_R, high up: the bombs from above
            A.a += 0.45 * dt;
            const wx = pp.x + Math.cos(A.a) * SAVIOR.STRAFE_R, wz = pp.z + Math.sin(A.a) * SAVIOR.STRAFE_R;
            const ex = wx - v.x, ez = wz - v.z, ed = Math.hypot(ex, ez);
            if (ed > 0.6) { moveX = ex / ed; moveZ = ez / ed; speed = Math.min(SAVIOR.AIR_SPEED, ed * 2.5); }
            face(pp.x, pp.z);
            v.hp = Math.min(v.maxHp, v.hp + SAVIOR.AIR_REGEN * 0.5 * dt);
            A.bomb -= dt;
            if (F._prepTick(v, dt)) { /* (saying a bomb: it flies when it is said) */ }
            else if (A.bomb <= 0 && !v.prep && v.mana >= 25) {
                const spell = v.mana >= 60 && Math.random() < 0.4 ? 'BombardoMaxima' : 'Bombardo';
                const fp = { x: pp.x, y: pp.y - 0.4, z: pp.z };
                if (F._begin(v, spell, this.foe, fp, { cost: NPC_COST[spell], cd: 1 })) A.bomb = SAVIOR.BOMB_EVERY;
            }
            if (A.t >= SAVIOR.STRAFE_T) { A.st = 'land'; A.t = 0; }
        } else if (A.st === 'land') {
            targetY = gy + SAVIOR.FLY_H;
            moveX = dx / d; moveZ = dz / d; speed = d > 14 ? SAVIOR.AIR_SPEED * 0.6 : 0;
            face(pp.x, pp.z);
            if (Math.abs(v.y - targetY) < 0.7) { this.air = null; this.airCd = SAVIOR.AIR_CD; v.castCd = Math.max(v.castCd || 0, 1); this._note({ ev: 'landed' }); }
        }
        if (speed > 0) {
            const nx = v.x + moveX * speed * dt, nz = v.z + moveZ * speed * dt;
            if (c.pointBlocked?.(nx, v.y + 2, nz)) { A.a += 0.8; } else { v.x = nx; v.z = nz; } // (a wall / a mountain in the way: round it)
        }
        v.y += (targetY - v.y) * Math.min(1, dt * 2.5);
        v.speed = speed > 0 ? Math.min(speed, 8) : 0;
        if (v.castT > 0) v.mode = 'cast'; else v.mode = speed > 0 ? 'run' : 'idle';
        return true;
    }

    /** He goes: the last line, a flash of light; for a while no other comes at the same player. */
    _leave(v, kind) {
        const L = this.life, g = this.game;
        const s = saviorLine(kind, this.lastLine);
        if (s && !v.dead) L._say(v, s, 4);
        g.fx?.lightFlash?.(_v.set(v.x, v.y + 2, v.z), 0xfff6d8, 3, 0.8, 40);
        this._note({ ev: 'leave', why: kind });
        if (this.foe != null) this.watch.rest(this.foe, performance.now() / 1000);
        setTimeout(() => { if (!v.dead) L._deactivate(v); }, kind === 'win' ? 2500 : 600);
        this.v = null; this.foe = null;
    }

    /** (CastleLife._die) The Saviour died — `by` struck the last blow. A player beat him: for good the next ones are of 1500 mana, and two game days of peace. */
    onDeath(v, by) {
        if (this.v !== v && v.savior == null) return;
        const L = this.life;
        if (by != null && L?._isPlayer(by)) {
            this.stage.set(by, 1);
            this.rest.set(by, this.days + SAVIOR.REST_DAYS);
            this.watch.forget(by);
            this._note({ ev: 'beaten', by });
            this.game.hud?.setVoice?.('✨ Волшебник-спаситель побеждён. Он не вернётся два игровых дня — но придёт другой, сильнее', true);
        }
        this.v = null; this.foe = null;
    }
    _over(v) { if (this.v === v) { this.v = null; this.foe = null; } }

    /** The hero died: the counts of the dead hero are forgotten; a Saviour out goes. */
    playerDied(id) {
        this.watch.forget(id);
        if (this.v && this.foe === id) this._leave(this.v, 'win');
    }

    // ------------------------------------------------------------ saving
    snapshot() {
        if (!this.stage.size && !this.rest.size && !this.days) return null;
        return { days: Math.round(this.days * 1000) / 1000, stage: [...this.stage], rest: [...this.rest].map(([k, d]) => [k, Math.round(d * 1000) / 1000]) };
    }
    restore(o) {
        this.days = +o?.days || 0;
        this.stage = new Map((o?.stage || []).filter((e) => Array.isArray(e)));
        this.rest = new Map((o?.rest || []).filter((e) => Array.isArray(e)));
    }

    dispose() { this.v = null; this.foe = null; }
}
