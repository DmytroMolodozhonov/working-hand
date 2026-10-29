/**
 * SunContest.js — «To the Sun» against the black storm clouds of the gargoyle ritual (the caster's computer; the rules and numbers are
 * GargoyleRules.js: `SUN`, `sunStep`; the burning of the gargoyles and the clearing of the sky — Gargoyles.js; the beam — fx/SunBeam.js).
 *
 * The author's words: the spell enters a struggle with the clouds. At the first moment it breaks them with a chance P0 (15 %); if not, the
 * animation goes on, and after 5 s the spell itself takes 20 mana a second more and the chance is 30 %, growing by 10 % every second, until
 * 100 % or until the mana runs out. The clouds defend themselves — they draw in round the beam, swirl, flash, press back — and the light
 * breaks through all the same.
 *
 * It is a HELD spell (concentration, Concentration.HELD.SunClouds): «стоп», a stun, a fall, death or a lowered wand end it. The struggle
 * only runs (the time, the mana) while the beam is really on the clouds; the beam follows the wand — point it elsewhere and the struggle
 * waits. The caster's computer rolls and pays; the win goes to the host (`requestDispel`), which sets the gargoyles on fire; the beam's
 * place and the clouds' press (`sunfx`) go to everybody, five times a second.
 */

import { castingHand } from './WandAim.js';
import { GARGOYLE, sunStart, sunStep } from './GargoyleRules.js';

const SEND_T = 0.2; // s between two messages of the beam to the others
const LOWER_T = 3; // s with the wand lowered (or the hand down): the spell ends
const NOTE_T = 2.2; // s between two reminders of what the beam must do

export class SunContest {
    constructor(game) {
        this.game = game;
        this.st = null;
        this.r = null;
        this._send = 0;
        this._low = 0;
        this._note = 0;
        this._flashT = 0;
    }

    get active() { return !!this.st; }

    /** The clouds of a ritual are over me: begin the struggle (the cast has already been paid). @returns {boolean} */
    start() {
        const g = this.game;
        if (this.st) return true;
        const pos = g.character?.group?.position;
        const r = pos && g.gargoyles?.cloudsOver(pos);
        if (!r) return false;
        this.st = sunStart();
        this.r = r;
        this._send = 0; this._low = 0; this._note = 0; this._flashT = 1;
        g.perf?.note?.('☀️ To the Sun: борьба с тучами горгулий');
        return true;
    }

    /** «стоп» / a lost concentration / the end: true when it was going. */
    stop(why = 'stop') {
        const st = this.st;
        if (!st) return false;
        const g = this.game, r = this.r;
        this.st = null; this.r = null;
        this._tellFx(r, null, null, 0, false);
        if (why === 'mana') g.hud?.setVoice?.('☀️ Не хватило маны — луч погас, чёрные тучи устояли', true);
        else if (why === 'lowered') g.hud?.setVoice?.('☀️ Палочка опущена — луч погас', true);
        else if (why === 'gone') g.hud?.setVoice?.('☀️ Тучи рассеялись', true);
        return true;
    }

    _tellFx(r, o, d, stress, on) {
        const g = this.game;
        if (!r) return;
        if (on) { g.gargoyles.sunFx(r, o, d, stress, true); }
        else if (r.sunFx) r.sunFx.on = false;
        if (g.sync) g.gargoyles._send(on ? { op: 'sunfx', rid: r.id, o: [+o.x.toFixed(1), +o.y.toFixed(1), +o.z.toFixed(1)], d: [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)], s: +stress.toFixed(2), on: 1 } : { op: 'sunfx', rid: r.id, o: [0, 0, 0], d: [0, 1, 0], s: 0, on: 0 });
    }

    /** Every frame while the spell is held. */
    update(dt) {
        const st = this.st;
        if (!st) return;
        const g = this.game, G = g.gargoyles, r = this.r;
        if (!r || r.broken || !G.rituals.includes(r)) { this.stop('gone'); return; }
        const hand = castingHand(g);
        const up = !!hand && g.character.isArmRaised(hand.side) && hand.dir.y > GARGOYLE.SUN.AIM_UP;
        this._low = up ? 0 : this._low + dt;
        if (this._low > LOWER_T) { this.stop('lowered'); return; }
        const hit = up ? G.cloudHit(hand.origin, hand.dir) : null;
        const aimed = !!hit && hit.r === r;
        this._note -= dt;
        if (!aimed) {
            if (this._note <= 0 && up) { this._note = NOTE_T; g.hud?.setVoice?.('☀️ Направьте палочку на чёрные тучи — пока луч не на них, борьба стоит', true); }
            this._send -= dt;
            if (this._send <= 0) { this._send = SEND_T; this._tellFx(r, null, null, 0, false); }
            return;
        }
        // the struggle goes: time and mana run while the beam is on the clouds
        const c = g.combat;
        const free = !c?.manaOn; // (Creative with endless mana: nothing is counted)
        const out = sunStep(st, dt, free ? Infinity : c.fatigue, Math.random);
        if (out.cost && !free) c.fatigue = Math.max(0, c.fatigue - out.cost);
        for (const x of out.rolls) {
            if (x.sec > 0 && !x.won) g.hud?.setVoice?.(`☀️ Тучи держатся… (шанс прорвать ${Math.round(x.chance * 100)} %, −${GARGOYLE.SUN.COST} маны в секунду)`, true);
        }
        const stress = Math.min(1, st.t / (GARGOYLE.SUN.WAIT + 7));
        this._send -= dt;
        if (this._send <= 0) {
            this._send = SEND_T;
            this._tellFx(r, hand.origin, hand.dir, stress, true);
        } else G.sunFx(r, hand.origin, hand.dir, stress, true);
        // (the beam's look and the clouds' answer — rings of shock, their own bolts, the moan — are drawn by sunFx on every computer: Gargoyles.sunFx, RitualFx)
        if (st.won) {
            G.sunFx(r, hand.origin, hand.dir, 1, false);
            this.stop('won');
            G.requestDispel(r, g.localId);
        } else if (st.lost) this.stop('mana');
    }
}
