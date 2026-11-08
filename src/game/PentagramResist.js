/**
 * PentagramResist.js — the game part of the two white pentagrams of protection (the rules and the author's words: ResistRules.js; the circles: Pentagranium.js, which calls
 * `useCircle` each frame the hero stands in a lit circle of this kind).
 *
 *   dark «Albedo»  — three flowers lying on the circle, 150 mana → every dark spell against me is twice as weak; only while my dark level ≤ 10, and never together with the
 *                    mark of «Breakward». `update` looks at it once a second: above 10, or the «Breakward» mark on me — the protection goes at once, with a word.
 *   fire «Ignaris» — a Brightflower's heart lying on the circle, 150 mana → ordinary fire does nothing to me (no harm, no catching fire); the hell's fire still hurts but cannot set me
 *                    alight; the fire serpent (hell fire) hurts at half. The cut is `filterDamage`, called by Combat.damage; the «no catching fire» is `Burning._igniteMe`.
 *
 *   blast «Murus» — a leaf of the Armourleaf lying on the circle, 150 mana → «Бомбарда» / «Бомбарда Максима» do no harm to me (the push stays), the other blasts are twice as weak (`filterDamage`).
 *
 * The gifts live with the hero (the world's player record `resist`; a death takes them — `onDeath`; «Give Me My Power» brings them back — Legacy.js).
 *
 * «А если»: not enough mana / a flower missing — nothing is paid or burnt, a hint says what to bring (once per standing); two circles of one kind — «already have», nothing paid; dead / game closed
 * while the picture goes — the gift is set at once, the picture is only the picture; a neighbour grabbing a lying flower — the host's item list decides (`itemGone`); a stack of two — one is used;
 * Creative — no flowers, no mana (the dark-level / «Breakward» conditions still hold); burning at the moment I get the fire ward — the fire goes out; a save from before — no gifts; the gift with a
 * dark level above 10 in an old save — taken off at the first look.
 */
import * as THREE from 'three';
import { RESIST, RESIST_HINT, findFlowers, findFireHeart, findArmorLeaf, findGripHead, canGetDarkWard, keepsDarkWard, darkFactor, fireFactor, blastFactor } from './ResistRules.js';
import { darkLevel } from './DarkMagic.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const COLS = { grip: [0x7be7c5, 0xe0fff4, 0x2ea78b, 0xfff0bc], dark: [0xffffff, 0xfff4d0, 0xcfe8ff, 0xffe9a8], fire: [0xff7a1a, 0xffc15a, 0xfff0b0, 0xff4a10], blast: [0xc8d6e4, 0xf2c24a, 0xffffff, 0x8ea6bf] };

export class PentagramResist {
    constructor(game) {
        this.game = game;
        this.dark = false;
        this.fire = false;
        this.blast = false;
        this.strongHands = false;
        this.anim = null; // the picture {kind, t, m}
        this._chk = 0;
    }

    // ------------------------------------------------------------ saving
    snapshot() { return this.dark || this.fire || this.blast || this.strongHands ? { d: this.dark ? 1 : 0, f: this.fire ? 1 : 0, b: this.blast ? 1 : 0, ...(this.strongHands ? { h: 1 } : null) } : null; }
    restore(o) { this.dark = !!o?.d; this.fire = !!o?.f; this.blast = !!o?.b; this.strongHands = !!o?.h; this._chk = 0; }
    /** Death: both gifts go (they lie in the body with the rest of the power: Legacy.js). */
    onDeath() { const had = this.dark || this.fire || this.blast || this.strongHands; this.restore(null); this.anim = null; if (had) this.game.perf?.note?.('🛡️ защита от тёмной магии / огня: дары забрала смерть'); }

    // ------------------------------------------------------------ what it does
    /** Combat.damage: a blow of `amount` of `kind` against me — how much of it gets through. */
    filterDamage(amount, kind) {
        if (this.dark) amount *= darkFactor(kind);
        if (this.fire) amount *= fireFactor(kind);
        if (this.blast) amount *= blastFactor(kind); // (only the harm: the push and the fall come from CreatureImpact / the blast itself)
        return amount;
    }
    /** Burning._igniteMe: may fire set me alight? (the ward: never — neither the ordinary fire nor the hell's) */
    get fireproof() { return this.fire; }

    // ------------------------------------------------------------ the circles
    /**
     * The hero stands in a circle of protection (called by Pentagranium._useStep each frame while inside).
     * `ctx`: { m (the mark), pays (mana rules), hint(text), mana (now), fx() } → true when the gift was given this frame.
     */
    useCircle(kind, ctx) {
        const g = this.game, pays = ctx.pays;
        if (g.isDeadLocal || g.combat?.dead) return false;
        const dark = kind === 'dark', blast = kind === 'blast', grip = kind === 'grip';
        if (grip ? this.strongHands : dark ? this.dark : blast ? this.blast : this.fire) { ctx.hint('🛡️ ' + (grip ? RESIST_HINT.gripHave : dark ? RESIST_HINT.darkHave : blast ? RESIST_HINT.blastHave : RESIST_HINT.fireHave)); return false; }
        let used = [];
        if (dark) {
            const can = canGetDarkWard({ level: darkLevel(g.dark), broken: !!g.breakward?.marked, has: this.dark });
            if (!can.ok) { ctx.hint('🤍 ' + (can.why === 'broken' ? RESIST_HINT.broken : RESIST_HINT.dark(darkLevel(g.dark)))); return false; }
            if (pays) {
                const f = findFlowers(this._looseIn(ctx.m));
                if (!f.ok) { ctx.hint('🤍 ' + RESIST_HINT.noFlowers(f.missing)); return false; }
                used = f.used;
            }
        } else if (grip) {
            if (pays) {
                const h = findGripHead(this._looseIn(ctx.m));
                if (!h) { ctx.hint('🙌 ' + RESIST_HINT.noHead); return false; }
                used = [h];
            }
        } else if (blast) {
            if (pays) {
                const h = findArmorLeaf(this._looseIn(ctx.m));
                if (!h) { ctx.hint('🛡️ ' + RESIST_HINT.noLeaf); return false; }
                used = [h];
            }
        } else if (pays) {
            const h = findFireHeart(this._looseIn(ctx.m));
            if (!h) { ctx.hint('🛡️ ' + RESIST_HINT.noHeart); return false; }
            used = [h];
        }
        if (pays && ctx.mana < RESIST.COST) { ctx.hint((dark ? '🤍 ' : '🛡️ ') + RESIST_HINT.noMana(RESIST.COST)); return false; }
        if (pays) { g.combat.fatigue -= RESIST.COST; g.combat._hudKey = ''; }
        for (const L of used) this._take(L);
        if (grip) this.strongHands = true; else if (dark) this.dark = true; else if (blast) this.blast = true; else { this.fire = true; g.burning?._outMe?.('ward'); } // (given at once: the picture below is only the picture; a burning one is put out)
        this.anim = { kind, t: 0, m: ctx.m };
        ctx.fx?.();
        g.hud?.setVoice?.(grip ? RESIST_HINT.gripDone : dark ? RESIST_HINT.darkDone : blast ? RESIST_HINT.blastDone : RESIST_HINT.fireDone, true);
        g.perf?.note?.(grip ? '🙌 Пентаграмма сильных рук: дар получен' : dark ? '🤍 Пентаграмма защиты от тёмной магии: дар получен' : blast ? '🛡️ Пентаграмма защиты от взрывов: дар получен' : '🛡️ Пентаграмма защиты от огня: дар получен');
        return true;
    }

    /** The things lying still inside the circle `m` (a flower thrown there counts). */
    _looseIn(m) {
        const out = [];
        if (!m) return out;
        for (const [uid, L] of this.game.items?.loose || []) {
            const p = L.model?.position;
            if (p && L.rest !== false && Math.hypot(p.x - m.x, p.z - m.z) <= m.r && Math.abs(p.y - m.y) < 4) out.push({ uid, item: L.item, L });
        }
        return out;
    }

    /** Uses up ONE of the lying stack. */
    _take(L) {
        const g = this.game, it = L.item;
        if ((it.count || 1) > 1) { it.count--; return; }
        g.items.removeLoose(L.uid);
        g.sync?.itemGone?.(L.uid, null, null);
    }

    // ------------------------------------------------------------ per frame
    update(dt) {
        if (this.dark) { this._chk -= dt; if (this._chk <= 0) { this._chk = RESIST.CHECK_S; this.recheck(); } }
        if (this.anim) this._animStep(dt);
    }

    /** The dark ward only stays while the dark level is ≤ 10 and there is no «Breakward» mark; otherwise it goes at once. → true if it went. */
    recheck() {
        if (!this.dark) return false;
        const g = this.game, level = darkLevel(g.dark), broken = !!g.breakward?.marked;
        if (keepsDarkWard({ level, broken })) return false;
        this.dark = false;
        g.hud?.setVoice?.(broken ? RESIST_HINT.darkLostBroken : RESIST_HINT.darkLost, true);
        g.perf?.note?.('🤍 защита от тёмной магии снята: ' + (broken ? 'метка слома защиты' : `уровень тьмы ${level}`));
        return true;
    }

    /** The picture: a ring of light runs out, a spiral of sparks climbs round the hero (white for the dark ward, flame-coloured for the fire ward), a flash at the end. */
    _animStep(dt) {
        const g = this.game, A = this.anim, fx = g.fx, me = g.character?.group?.position;
        if (!me) { this.anim = null; return; }
        A.t += dt;
        const T = RESIST.ANIM_T, k = Math.min(1, A.t / T), cols = COLS[A.kind];
        if (fx) {
            // Strong hands: green-gold coils bind each actual wrist, then flare along the fingers.
            if (A.kind === 'grip' && g.character?.getHandWorldPosition) {
                for (const side of ['left', 'right']) {
                    const hand = g.character.getHandWorldPosition(side, _v);
                    if (!hand) continue;
                    const a = A.t * 12 + (side === 'left' ? 0 : Math.PI), r = 0.35 * (1 - k * 0.5);
                    _d.set(Math.cos(a) * r, Math.sin(a) * r, 0);
                    _v.copy(hand).add(_d);
                    fx.spark(_v, cols[side === 'left' ? 0 : 3], 0.12, _d.set(0, 0.25, 0), 0.7);
                }
            }
            for (let i = 0; i < 3; i++) {
                const a = A.t * 6 + i * 2.1, h = -1.9 + k * 4.4;
                fx.spark(_v.set(me.x + Math.cos(a) * 1.3, me.y + h, me.z + Math.sin(a) * 1.3), cols[i % 4], 0.11, _d.set(-Math.sin(a) * 1.2, 0.6, Math.cos(a) * 1.2), 0.9);
            }
            for (const t0 of [0.6, 1.5, 2.4]) {
                if (A.t >= t0 && !A['r' + t0]) {
                    A['r' + t0] = 1;
                    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; fx.spark(_v.set(me.x, me.y - 0.8, me.z), cols[i % 4], 0.12, _d.set(Math.cos(a) * 6.5, 0.4, Math.sin(a) * 6.5), 1.0); }
                    fx.lightFlash?.(_v.set(me.x, me.y, me.z), cols[0], 3, 0.4, 24);
                }
            }
        }
        if (A.t >= T) this.anim = null;
    }

    dispose() { this.anim = null; }
}
