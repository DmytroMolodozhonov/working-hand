/**
 * Whirlpool.js — the whirlpool on the sea (the author 07.11: «водоворот засасывает корабли — большие быстрее, маленьким проще выбраться, но не обязательно выберутся, есть предел;
 * единственный, кто выбирается, — капитан Чёрные Усы, в 90 % случаев, но ему непросто; сам попадается в 3 раза реже, чем водяное торнадо; можно вызвать заклинанием — 400 маны»).
 * The rules and the timetable: world/TornadoWeather.js (WHIRL, whirlpoolsOf, shipNet); the picture: fx/WhirlpoolFx.js.
 *
 *   born  : in a storm on a deep sea (a third of the spouts' rate), or called by «Whirlpool» (400 mana, a deep sea 60 m ahead) — lives WHIRL.LIFE s (a called one SUMMON_LIFE), then fades
 *   ships : (the host) every ship in its reach (PULL 120 m) is drawn in: a bigger hull is drawn harder; she answers with her sails (more sail, more handy a small ship); past the point of no
 *           return (46 m) no ordinary ship gets out; in the eye (18 m) the hull is crushed and goes down (Ships._startSinking). Captain Black Moustache's ship has the skill to claw out — nine
 *           times of ten, never easily (she strains, rolls, creeps outwards slowly: you see her fight); the tenth she goes down. A ship that is not the captain's (a taken black ship too) is ordinary.
 *   crews : a crew that sees the whirlpool puts the helm over, away from it (fleet.flee)
 *   me    : (each computer pushes its own hero) swimming / floating within the pull: swirled and drawn in; in the eye dragged down (a second's harm). On a deck — the ship carries me.
 *   creatures: the sea's creatures flee it (nearWhirl)
 * Nothing is sent over the network except the spell's packet: the timetable is the same everywhere; the host does the harm to the ships.
 *
 * «А если»: no sea / space / hell → nothing; a ship wreck/sinking/moored → not touched; a whirlpool called over shallow water → refused; two at once → MAX_SUMMONED; the host leaves → the new host
 * starts again from the same timetable (a ship in the eye keeps its time in `s._whirlT`, lost when the host changes — she gets a second chance); 400 mana not there → "не хватает маны".
 */
import * as THREE from 'three';
import { WHIRL, whirlpoolsOf, whirlDraw, shipNet, luckOf } from '../world/TornadoWeather.js';
import { stormWeight } from '../world/OceanWeather.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { WhirlpoolFx } from '../fx/WhirlpoolFx.js';
import { isCursed } from './Ships.js';

const _list = [];
const _d = {};

export class Whirlpool {
    constructor(game) {
        this.game = game;
        this.fx = null;
        this.list = []; // near: [{id, x, z, k, spin, d, born, life}]
        this.summoned = [];
        this.calls = []; // callings being played: [{x, z, t, from, spin}]
        this._shipT = 0;
        this._cache = [];
        this._t4 = 0;
        this.sound = 0;
        this._eyeAt = new Map(); // ship id → seconds in the eye
    }

    // ------------------------------------------------------------ the spell
    /** Where a «Whirlpool» cast from p facing yaw opens: {x, z} ahead over deep sea, or null. */
    placeFor(p, yaw) {
        const sea = this.game.sea;
        if (!sea) return null;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        for (const d of [WHIRL.SUMMON_AHEAD, 80, 40, 110]) {
            const x = p.x + fx * d, z = p.z + fz * d;
            if (sea.index.signedDist(x, z) >= WHIRL.SUMMON_MIN_S && sea.s(x, z) >= WHIRL.SUMMON_MIN_S) return { x, z };
        }
        return null;
    }

    /** The spell arrives (every computer, from the packet): the calling plays, the whirlpool opens after its DELAY. */
    call(from, at, by = null, side = null) {
        const spin = Math.random() < 0.5 ? 1 : -1;
        this.calls.push({ x: at.x, z: at.z, t: 0, from: from.clone(), spin, by, side });
        while (this.calls.length > 3) this.calls.shift();
        const g = this.game;
        g.sound?.playSea?.(from, 'tail', 0.7);
        g.sound?.playRumble?.(new THREE.Vector3(at.x, WATER_LEVEL_Y, at.z), g.character?.group?.position || from);
        this.summon(at, by, CALL.DELAY, spin);
    }

    summon(at, by = null, delay = 0, spin = Math.random() < 0.5 ? 1 : -1) {
        const t = (this.game.weatherClock ?? Date.now() / 1000) + delay;
        const id = 'whirl:' + (by ?? '?') + ':' + Math.round(t * 10);
        if (this.summoned.some((s) => s.id === id)) return;
        this.summoned.push({ id, x0: at.x, z0: at.z, born: t, life: WHIRL.SUMMON_LIFE, spin, by, ph: Math.random() * 6.28 });
        while (this.summoned.length > WHIRL.MAX_SUMMONED) this.summoned.shift();
    }

    _summonedAt(t, out) {
        for (let i = this.summoned.length - 1; i >= 0; i--) {
            const s = this.summoned[i], age = t - s.born;
            if (age > s.life || age < -8) { this.summoned.splice(i, 1); continue; }
            const x = s.x0 + Math.sin(age / 53 + s.ph) * 6, z = s.z0 + Math.sin(age / 41 + s.ph * 1.7) * 6;
            const k = Math.max(0, Math.min(1, age / 9, (s.life - age) / WHIRL.FADE));
            out.push({ id: s.id, x, z, k, born: s.born, life: s.life, spin: s.spin, summoned: true, whirl: true });
        }
    }

    // ------------------------------------------------------------ the picture
    _fx() { return this.fx || (this.fx = new WhirlpoolFx(this.game.scene, this.game.water?.spray || null)); }
    samples() { return this._fx().samples(); }

    /** Is (x, z) within `r` + the pull of a whirlpool (the sea's creatures flee it)? */
    nearWhirl(x, z, r = 0) {
        for (const w of this.list) if (w.k > 0.2 && Math.hypot(x - w.x, z - w.z) < WHIRL.PULL * 0.7 + r) return w;
        return null;
    }

    // ------------------------------------------------------------ every frame
    update(dt) {
        const g = this.game, sea = g.sea, ch = g.character;
        const t = g.weatherClock ?? Date.now() / 1000;
        this._calls(dt);
        if (!sea || !ch || (g.space?.realm && g.space.realm !== 'earth') || g.hellGate?.inHell) { this._off(); return; }
        const me = ch.group.position;
        if (me.y > 2000) { this._off(); return; }
        this._t4 -= dt;
        if (this._t4 <= 0) {
            this._t4 = 0.25;
            _list.length = 0;
            if (this.summoned.length) this._summonedAt(t, _list);
            if (stormWeight(g.seed, t) > 0 || this.list.length) {
                for (const sea0 of sea.index.near(me.x, me.z, 900)) for (const w of whirlpoolsOf(sea.index, sea0, g.seed, t, [])) _list.push(w);
            }
            this._cache = _list.filter((w) => w.k > 0.01);
            for (const w of this._cache) w.d = Math.hypot(w.x - me.x, w.z - me.z);
            this._cache = this._cache.filter((w) => w.d < 900).sort((a, b) => a.d - b.d);
        }
        this.list = this._cache;
        if (this.list.length || this.fx) this._fx().update(dt, t, this.list, WATER_LEVEL_Y, 1 - 0.75 * (g.world?.nightAmount || 0));
        let snd = 0;
        for (const w of this.list) snd = Math.max(snd, w.k * Math.max(0, 1 - w.d / 300));
        this.sound = snd;
        this._pushMe(dt, me);
        if (g.authority) this._pushShips(dt, t);
    }

    _off() {
        if (this.list.length) { this.list = []; this.fx?.update(0, 0, [], 0, 1); }
        this.sound = 0;
    }

    /** The calling: the water ring closes in on the place, spun up by the sparks of the wand (a few seconds), then the whirlpool opens. */
    _calls(dt) {
        const g = this.game, fx = g.fx;
        for (let i = this.calls.length - 1; i >= 0; i--) {
            const C = this.calls[i];
            C.t += dt;
            if (C.t > CALL.DELAY + 2) { this.calls.splice(i, 1); continue; }
            if (!fx?.spark) continue;
            const y = WATER_LEVEL_Y + 0.4;
            // a stream of blue sparks from the wand down to the water over the place, a ring of spray closing in and spinning faster
            if (C.t < CALL.BEAM && Math.random() < dt * 60) {
                const k = Math.random();
                fx.spark(new THREE.Vector3().lerpVectors(C.from, new THREE.Vector3(C.x, y + 2, C.z), k), Math.random() < 0.5 ? 0x9fd8ff : 0xe8f6ff, 0.12, new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.6);
            }
            if (C.t < CALL.DELAY && Math.random() < dt * 140) {
                const a = Math.random() * 6.28, r = Math.max(6, 70 - C.t * 12) * (0.8 + Math.random() * 0.4);
                fx.spark(new THREE.Vector3(C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r), Math.random() < 0.5 ? 0xffffff : 0xcfe8ff, 0.16, new THREE.Vector3(-Math.sin(a) * (8 + C.t * 3) * C.spin - Math.cos(a) * 4, 2 + Math.random() * 3, Math.cos(a) * (8 + C.t * 3) * C.spin - Math.sin(a) * 4), 1.2);
            }
            if (!C.rumbled && C.t > 1) { C.rumbled = true; g.sound?.playThunder?.(0.5); }
        }
    }

    // ------------------------------------------------------------ me
    _pushMe(dt, me) {
        const g = this.game, ch = g.character;
        if (!this.list.length || g.combat?.dead || g.isDeadLocal) return;
        if (g.ships?.me?.ship) return; // (on a deck: the ship carries me — her fight is the host's)
        if (g.flight?.active && me.y - WATER_LEVEL_Y > 6) return; // (high in the air: nothing)
        for (const w of this.list) {
            if (w.d > WHIRL.PULL) break;
            const f = whirlDraw(w, 30, w.d, _d); // (a swimmer is a light body: a short hull's draw)
            if (!f || me.y - WATER_LEVEL_Y > 3 || me.y - WATER_LEVEL_Y < -(g.swim?.depth || 8) - 2) continue;
            if (g.steady?.absolute) return;
            const kb = g.knockback;
            const dx = w.x - me.x, dz = w.z - me.z, l = Math.hypot(dx, dz) || 1;
            const ux = dx / l, uz = dz / l;
            if (kb) { kb.x += (ux * f.in * 0.9 - uz * f.round * 0.6) * 3 * dt; kb.z += (uz * f.in * 0.9 + ux * f.round * 0.6) * 3 * dt; }
            if (f.eye && !g.swim?.waterWalking) {
                this._eyeHarm = (this._eyeHarm || 0) + dt;
                if (this._eyeHarm >= 1) { this._eyeHarm = 0; g.combat?.enabled ? g.combat.damage(4, null, 'Whirlpool') : g.damageLocalPlayer?.(4); g.hud?.setVoice?.('🌀 Водоворот затягивает вас вниз!', true); }
            } else if (f.grip > 0.5 && !this._warned) {
                this._warned = true;
                g.hud?.setVoice?.('🌀 Водоворот тянет вас к центру — плывите прочь!', true);
                setTimeout(() => { this._warned = false; }, 9000);
            }
            break;
        }
    }

    // ------------------------------------------------------------ the host: the ships
    _pushShips(dt, t) {
        const g = this.game, ships = g.ships;
        if (!ships?.awake?.size || !this.list.length) return;
        this._shipT += dt;
        const slow = this._shipT >= 1;
        if (slow) this._shipT = 0;
        const windLvl = 0.3 + 0.4 * Math.min(1, (g.wind?.speed || 4) / 16); // (how well the wind fills her sails: 0.3 … 0.7)
        for (const s of ships.awake) {
            if (s.state === 'wreck' || s.state === 'sinking' || s.state === 'moored' || !s.st) continue;
            const st = s.st, sx = s.pose?.x ?? st.x, sz = s.pose?.z ?? st.z;
            if (sx == null) continue;
            for (const w of this.list) {
                const d = Math.hypot(sx - w.x, sz - w.z);
                if (d > WHIRL.PULL || w.k <= 0.05) continue;
                const L = s.cls?.L || 60;
                const black = isCursed(s) && s.cls?.id === 'blackship';
                const sail = Math.max(0, ...((s.sails || []).map((x) => x.target || 0)));
                const aboard = ships.me?.ship === s;
                const crew = black ? 1.6 : aboard ? 1 : 0.25 + 0.75 * sail;
                const r = shipNet(w, L, d, { wind: windLvl, crew, black, blackLuck: luckOf(w.id, s.id ?? s.name ?? 'x') });
                const dx = w.x - sx, dz = w.z - sz, l = Math.hypot(dx, dz) || 1;
                if (slow && g.fleet?.flee) g.fleet.flee(s, Math.atan2((sx - w.x), (sz - w.z)) + Math.PI, 4); // (the helm over, away from it)
                // dragged in (the draw wins): she slides towards the middle, swung round; or clawing out: she strains and creeps outwards
                if (r.net > 0) {
                    st.x += (dx / l) * r.net * dt; st.z += (dz / l) * r.net * dt;
                    st.r = (st.r || 0) + w.spin * w.k * 0.18 * dt * Math.min(1, 0.4 + r.net * 0.2);
                    s.changed = true;
                } else if (black && r.fight >= 1) {
                    st.x -= (dx / l) * Math.abs(r.net) * 0.3 * dt; st.z -= (dz / l) * Math.abs(r.net) * 0.3 * dt; // (she creeps away, slowly)
                    s.changed = true;
                }
                // the strain: she shakes and rolls as she fights it
                if (r.fight > 0.45 && d < WHIRL.NO_RETURN * 1.6) {
                    st.r = (st.r || 0) + Math.sin(t * 3.7 + (s.st.x || 0) * 0.01) * 0.22 * r.fight * dt;
                    if (slow) { g.fx?.spark?.(new THREE.Vector3(sx, WATER_LEVEL_Y + 1.5, sz), 0xe8f6ff, 0.2, new THREE.Vector3((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 6), 0.8); this._groan(s); }
                }
                // the eye: the hull is crushed and goes down
                if (r.lost || (d < WHIRL.R && r.net > 0)) {
                    const sec = (this._eyeAt.get(s) || 0) + dt;
                    this._eyeAt.set(s, sec);
                    if (sec > 5 && ships._startSinking) { ships._startSinking(s); this._eyeAt.delete(s); g.hud?.setVoice?.(`🌀 «${s.name || 'Корабль'}» затянуло в водоворот!`, true); }
                } else this._eyeAt.delete(s);
                break;
            }
        }
    }

    _groan(s) {
        const g = this.game;
        if (g.ships?.me?.ship === s && !this._groanT) { this._groanT = true; g.hud?.setVoice?.('🌀 Водоворот держит корабль — он борется, скрипит и кренится!', true); setTimeout(() => { this._groanT = false; }, 7000); }
    }

    dispose() { this.fx?.dispose(); this.fx = null; this.list = []; this.summoned.length = 0; this.calls.length = 0; this._eyeAt.clear(); }
}

const CALL = { DELAY: 5, BEAM: 2.5 };
