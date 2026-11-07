/**
 * WaterWalk.js — «Aquambula» (water + ambulare, «ходить»): the water holds the hero's feet and he walks on it as on a floor. Only from a scroll.
 *
 * The author 06.11: a spell with which one can walk on water; it needs concentration (a HELD spell: Concentration.HELD); 50 mana at once and 1 mana a second.
 *
 * How it plays: the word with the wand raised → 50 mana (Combat.SPELL_COST.WaterWalk), the hero's own water surface becomes a floor under his feet (`Character.waterFloor`,
 * asked in the ground step: the higher of the real ground and the water's top, so a shore, a bridge, a ship's deck and a step up out of the water all go on working); then 1 mana a
 * second (`SEE`-like drain: Combat.drain). «Стоп», no mana, a stun / a knock-down (Concentration.lose), death, the water leaves — it ends: over deep water the hero sinks and swims
 * (Swimming takes the body again); the last 6 mana over deep water are warned about once. The picture: a ring of light at the feet when it is cast, a little ripple and splash at each step
 * on the water (the shared spark pool, the ordinary splash: nothing new in the frame).
 *
 * «А если»: cast under the water → the water holds the body up to the top (it rises, `LIFT` m at most; deeper: the feet keep to the bottom until it is within reach), no air runs out on top;
 * cast in the air (a jump / a fall) → he lands on the water as on a floor; flying / on a surfboard / in another body (Imperius) / a dragon form → «Aquambula» is not cast (a hint, nothing is paid);
 * a ship at sea: its own deck / hull floor wins where it is higher (the floor is the higher of the two); under a bridge → the water there is stood on, the bridge's deck above is its own floor;
 * lava / hell / space: `waterAt` knows only real water blocks — nothing is walked on there; the sea's waves: the floor follows the surface (the body bobs with the swell); the caster dies / the game
 * closes / leaves the world → off at once; a second «Aquambula» while on → «already», nothing paid; the other players see a hero standing on the water (the body's height goes with the state as always),
 * the spell itself is nobody else's business — it harms, frightens and moves nobody; old saves: not saved (a held spell ends with the session, like the others); host decides nothing here.
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';

export const WALK = {
    DRAIN: 1, // mana a second while it is on (the cost at once: Combat.SPELL_COST.WaterWalk — 50)
    LIFT: 3.2, // m: how far below the surface the water still lifts the feet to the top (cast under the water)
    STEP_T: 0.3, // s between two ripples of a walking hero
    LOW_MANA: 6, // mana left over deep water: warned once
    DEEP: 3.2, // m: water at least this deep — the hero would swim there (Swimming.SWIM_DEPTH)
    FIRST: 2, // cells of the mana maximum the first time the hero really stood on water (Mana.FIRST_SPELL.WaterWalk)
};

/** ON WHOM / ON WHAT (CLAUDE.md): the spell acts on the caster's own feet only. */
export const WALK_TARGETS = {
    me: { does: 'stand', why: 'вода держит ноги заклинателя как пол (до конца заклинания); сначала 50 маны, потом 1 мана в секунду' },
    players: { does: 'none', why: 'на других не действует; они видят, как герой идёт по воде (высота тела едет в обычном пакете позы)' },
    zombies: { does: 'none', why: 'не действует' }, castlePeople: { does: 'none', why: 'не действует; жители только смотрят' },
    animals: { does: 'none', why: 'не действует' }, sailors: { does: 'none', why: 'не действует' },
    ships: { does: 'floor', why: 'палуба и корпус корабля, если они выше воды, остаются полом (пол — большее из двух)' },
    water: { does: 'floor', why: 'любая настоящая вода (озеро, море, пруд, бассейн): стоишь на её поверхности, на море — вместе с волной; лава и вода других миров — нет' },
    spells: { does: 'none', why: 'другие заклинания идут как обычно (кроме тех, что требуют концентрации: «сначала стоп»)' },
};

/** The floor the water gives: the surface, when it is within reach of the feet (or a `LIFT` above them: a swimmer is lifted to the top). Pure. */
export function waterFloor(surface, reachY) {
    if (!(surface > -1e8)) return null;
    return surface <= reachY + WALK.LIFT ? surface : null;
}

/** Warn only the once, when the mana runs low over deep water. Pure. */
export const lowManaWarn = (mana, deepBelow, warned) => !warned && deepBelow && mana > 0 && mana <= WALK.LOW_MANA;

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const RING = [0x9fe8ff, 0xe8fbff, 0x6fc4ff, 0xffffff];

export class WaterWalk {
    constructor(game) {
        this.game = game;
        this.on = false;
        this._stepT = 0;
        this._warned = false;
        this._first = false;
        this._onWater = false;
        this._floor = (x, z, reach) => this._floorAt(x, z, reach); // (one function for the whole life: nothing made in the frame)
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.on) return hint('🌊 «Aquambula» уже держит вас на воде. «Стоп» — отпустить');
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('🌊 Поднимите руку с палочкой вверх и скажите «Aquambula»'); // (the author: the arm must be up — a wand in a hanging hand is not enough)
        if (g.flight?.active || ch.flying) return hint('🌊 Вы летите — по воде идти незачем');
        if (g.boards?.mounted) return hint('🌊 Вы на доске — сойдите с неё, чтобы идти по воде');
        if (g.imperius?.active || g.dragonForm?.active || g.monster?.active) return hint('🌊 В этом теле по воде не пойти');
        const tired = g.combat.check('WaterWalk');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('WaterWalk');
        this.set(true);
        this._ring();
        g.hud.setVoice('🌊 Вода держит ваши ноги — идите по ней. Мана уходит по капле; «стоп» — отпустить воду', true);
        return 'WaterWalk';
    }

    /** On / off on my computer. */
    set(on, why = null) {
        if (this.on === on) return;
        const g = this.game, ch = g.character;
        this.on = on;
        this._warned = false;
        this._stepT = 0;
        ch.waterFloor = on ? this._floor : null;
        g.perf?.note?.(on ? '🌊 Aquambula: включена' : '🌊 Aquambula: выключена' + (why ? ' (' + why + ')' : ''));
        if (!on) {
            if (why === 'mana') g.hud.setVoice('🌊 Мана кончилась — вода отпустила вас', true);
            else if (why === 'stop') g.hud.setVoice('🌊 Вода вас отпустила', true);
            g.sound?.playSpellFx?.('fxStop', null, 0.5, 1);
        }
    }

    /** «стоп» / a broken concentration: true when it was on. */
    stop(why = 'stop') {
        if (!this.on) return false;
        this.set(false, why);
        return true;
    }

    /** What `Character.waterFloor` asks (the ground step: x, z, how high the feet can reach): the water's top there, or null. */
    _floorAt(x, z, reach) {
        const w = this.game.swim?.waterAt?.(x, z, reach - 1.1);
        return w ? waterFloor(w.surface, reach) : null;
    }

    update(dt) {
        if (!this.on) return;
        const g = this.game, ch = g.character;
        if (g.combat?.dead || g.isDeadLocal) { this.set(false, 'dead'); return; }
        if (g.flight?.active || g.imperius?.active) { this.set(false, 'stop'); return; }
        if (g.combat?.drain(WALK.DRAIN * dt, dt) === false) { this.set(false, 'mana'); return; }
        const p = ch.group.position;
        const w = g.swim?.waterAt?.(p.x, p.z, p.y - 2);
        const feet = p.y - 1.95;
        this._onWater = !!w && Math.abs(feet - w.surface) < 0.5 && ch.onGround;
        if (this._onWater) {
            if (!this._first) { this._first = true; g.mana?.success?.('WaterWalk'); } // (the first real step on the water: +cells, once)
            this._stepT -= dt;
            const moving = Math.hypot(ch._planar?.x || 0, ch._planar?.z || 0) > 0.6;
            if (moving && this._stepT <= 0) { this._stepT = WALK.STEP_T; this._ripple(p.x, w.surface, p.z); }
            // low mana over deep water: one warning
            const c = g.combat;
            if (c?.enabled && lowManaWarn(c.fatigue, w.depth >= WALK.DEEP, this._warned)) { this._warned = true; g.hud.setVoice('🌊 Мана на исходе — выходите на берег: вода скоро отпустит вас', true); }
        }
    }

    /** A footstep on the water: a little ring of ripples and a soft splash (the shared pools). */
    _ripple(x, y, z) {
        const g = this.game, fx = g.fx;
        g.swim?._splash?.(_v.set(x, y, z), 0.28);
        if (!fx) return;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
            fx.spark(_v.set(x, y + 0.08, z), RING[i % 4], 0.07, _d.set(Math.cos(a) * 1.5, 0.15, Math.sin(a) * 1.5), 0.55);
        }
    }

    /** The cast: a ring of light runs out over the water (or the ground) from the feet, a pillar of bubbles rises round the body. */
    _ring() {
        const g = this.game, fx = g.fx, p = g.character.group.position;
        if (!fx) return;
        const y = p.y - 1.9;
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            fx.spark(_v.set(p.x, y + 0.1, p.z), RING[i % 4], 0.14, _d.set(Math.cos(a) * 5, 0.25, Math.sin(a) * 5), 0.9);
        }
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.7;
            fx.spark(_v.set(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r), 0xcdf3ff, 0.1, _d.set(0, 2.2 + Math.random() * 2, 0), 0.8);
        }
        fx.lightFlash?.(_v.set(p.x, y + 0.5, p.z), 0x9fe8ff, 2.4, 0.4, 14);
    }

    dispose() { this.set(false, 'dispose'); }
}
