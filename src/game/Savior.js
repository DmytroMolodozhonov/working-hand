/**
 * Savior.js — «Волшебник-спаситель» in the game (the rules, the numbers and the author's words: SaviorRules.js). `g.savior`.
 *
 *   host: every wizard killed by a player (CastleLife._die → `noteKill`) is counted; the 10th (later the 5th) within 2 minutes → a roll → the Saviour comes: a white
 *   wizard of his own place «ww<7000+n>_<stage>» (people: SaviorRules.saviorEntry — the same on a guest's computer), appears high up 38–60 m from the killer in a flash and
 *   comes down; he is after the killer (`v.foe`) and fights as the wizards do (WizardFight: duel spells, the dome «Protection Maxima», the wind, the blink) — only faster,
 *   hovering above the ground (`v.savior` → CastleLife._ground), with the white spells of SAVIOR.SPELLS, and nothing dark. Ten prepared lines — he despises killers.
 *   Beaten by the player: stage 1 (1500 mana) for good and two game days of peace; after them a new one comes only after FIVE wizards, and only by chance.
 *
 * «А если»: the killer dies / leaves the game / is far (FAR) / ten quiet minutes → he says a line, goes in a flash of light (no mercy given: he leaves, never forgives);
 * the killer is invisible → he knows where the player is (`_playerPos`), as any wizard of the world: a Saviour is not fooled by it; a Saviour already out → no second one;
 * a guest kills the wizards → the host counts them for his id, the Saviour comes at the guest; the host leaves → the Saviour is gone with the world (not saved);
 * night / sleep / school lesson / arena duel kills (`quietKill`, practice) are not counted; the game saved → the counters of the days and of the stages are kept.
 */
import * as THREE from 'three';
import { SAVIOR, STAGES, stageOf, GX0, KillWatch, saviorComes, saviorLine } from './SaviorRules.js';
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
        this.log = [];
    }

    get auth() { return this.game.authority !== false; }
    get life() { return this.game.castleLife; }
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
