/**
 * StrongMagic.js — what the strong duel charges and the new ice DO when they touch (StrongSpells.js: the numbers
 * and the table «на кого и на что»). Duel.js flies the charges and asks this module when one arrives:
 *
 *   hitMe(spell, by, side)            on my computer (it knows my shield, my HP)
 *   hitCreature(k, c, spell, by, o)   on the host (it runs the creatures); k — Duel's kind letter
 *
 * Over time (the host): Accentric's −5/s and the ice's −3/s (Maxima −10/s) — `dots`; Accentric's haze on a creature —
 * `c.accT` (half its blows fail: StrongSpells.confusedMiss) plus CreatureImpact's daze (it reels, stumbles).
 * On me: the picture blurs and strange sounds come (`accMe`), the ice bites while it holds (`iceMe`).
 *
 * «Электром» is held (Concentration.HELD.Electrum): its charge flies like any other; once it hit, the caster's
 * computer holds a crackling lightning from the hand to the target while the hand stays on it, paying 3 mana a
 * second, and sends −20 HP/s in ticks — to the host (creatures) or to the player hit (his computer decides, his
 * «Protection» drinks it with its mana). Everybody sees the lightning ('sm' el / elx).
 *
 * «Пилбидрио»'s burst and «Дай»'s black dissolving are seen by everybody ('sm' burst / dust): the host kills, then
 * tells; each computer hides the body and plays the look. FPS: the pieces are the shared debris cubes and sparks
 * (Effects pools), no new meshes, no lights; nothing piles up (the lists drop what is gone).
 *
 * Network messages 'sm': op el / elx (the held lightning), et (an Electrum tick), burst, dust, terror.
 */

import * as THREE from 'three';
import { STRONG, isStrongDuel, isIceCharge, pilbidrioBursts, isTitan, TITAN_WHY, accentricK, icePart, ICE_PART } from './StrongSpells.js';
import { kindOf } from './CreatureImpact.js';
import { isGodGift } from './ItemTypes.js';
import { isCold } from './IceQueen.js';
import { WARD } from './HouseWards.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
const STRONG_OR_ICE = (spell) => isStrongDuel(spell) || isIceCharge(spell);
const _body = { kind: 'n', id: null, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };

/** The colours a body bursts into (Pilbidrio): flesh, cloth, blood; bones; wood; ice; scales; feathers. */
const PALETTE = {
    flesh: [0xe0a98a, 0x8a1010, 0x5a3a2a, 0xb3001b, 0x3d5a8a],
    zombie: [0x6f8f5a, 0x4a2f1f, 0x7a1a10, 0x3b4a2a],
    bone: [0xe8e0c8, 0xd8ceb0, 0xbfb59a],
    wood: [0x6b4a2b, 0x8a6a3e, 0x3f7a2a],
    ice: [0xe8fbff, 0x9fd8ff, 0xffffff],
    dragon: [0x2f7a3a, 0x8a0f14, 0xa9d46e, 0x17151c],
    spider: [0x222222, 0x3a2a2a, 0x6bff6b],
    bird: [0xff8a2a, 0xffd25a, 0x8a5a2a],
};

export class StrongMagic {
    constructor(game) {
        this.game = game;
        this.dots = []; // (host) {k, c, rate, left, spell, by, acc}
        this.dazed = []; // (host) creatures in Accentric's haze: {c, k}
        this.accMe = null; // {t, by, dealt, acc}
        this.iceMe = null; // {left, rate, by, acc}
        this.electrum = null; // mine: {side, tk, tid, t, off, acc, wand}
        this.beams = new Map(); // others' lightning: by -> {side, tk, tid}
        this.log = []; // (tests) what happened
        this._blurAt = 0;
        this._weirdT = 2;
    }

    get me() { return this.game.localId; }
    get auth() { return this.game.authority !== false; }

    _note(e) { this.log.push(e); if (this.log.length > 30) this.log.shift(); }
    _send(m, relay = true) { this.game.sync?.net?.send?.({ t: 'sm', ...m }, relay); }

    // ============================================================ on me
    /**
     * A charge reached me (Duel.applyToMe; the shield was asked on arrival). @returns true if it was one of these.
     */
    hitMe(spell, by, side = 'right') {
        const g = this.game, c = g.combat;
        const p = c.center(_v);
        if (spell === 'Accentric') {
            g.hud?.flashColor?.('rgba(190, 90, 255, 0.45)');
            if (c.godsKeepsOff('Accentric')) return true;
            this.accMe = { t: 0, by, dealt: 0, acc: 0 };
            g.hud?.setVoice?.(c.enabled ? '🌀 «Акцентрик»: в глазах мутнеет, всё плывёт… Это пройдёт' : '🌀 «Акцентрик» попал в вас — в глазах мутнеет (здесь не ранит)', true);
            this._note({ ev: 'accMe', by });
            return true;
        }
        if (spell === 'Pilbidrio') {
            g.hud?.flashColor?.('rgba(255, 250, 220, 0.7)');
            if (!c.enabled) { g.hud?.setVoice?.('✨ «Пилбидрио» попал в вас (здесь не ранит)', true); return true; }
            if (pilbidrioBursts(c.hp) && !c.godsKeepsOff('Pilbidrio')) { this._burstMe(by); return true; }
            c.damage(STRONG.Pilbidrio.dmg, by, 'Pilbidrio');
            return true;
        }
        if (spell === 'Die') { this._dieMe(by); return true; }
        if (spell === 'Electrum') {
            g.hud?.flashColor?.('rgba(150, 210, 255, 0.5)');
            if (c.enabled) c.damage(STRONG.Electrum.hit, by, 'Electrum');
            else g.hud?.setVoice?.('⚡ «Электром» попал в вас (здесь не ранит)', true);
            return true;
        }
        if (isIceCharge(spell)) {
            const max = spell === 'IceDuelMaxima', I = max ? STRONG.IceMaxima : STRONG.Ice;
            c.freeze(by, I.time);
            g.hud?.flashColor?.('rgba(150, 220, 255, 0.6)');
            if (c.frozen) this.iceMe = { left: I.time, rate: I.dps, by, acc: 0 };
            if (!c.enabled) g.hud?.setVoice?.(max ? '🧊 «Айс Максима» — вы во льду' : '🧊 «Айс» попал в вас — вы во льду', true);
            return true;
        }
        return false;
    }

    /** Pilbidrio blew me apart: my body bursts (everybody sees it), the bones stay with my old power, my things fall. */
    _burstMe(by) {
        const g = this.game;
        const p = g.combat.center(_v).clone();
        this.burstLook(p, 1.1, 'flesh');
        this._send({ op: 'burst', p: r3a(p), s: 1.1, pal: 'flesh', k: 'p', id: this.me });
        g._deathHow = 'burst';
        g.combat.die(by, 'pilbidrio');
        this._note({ ev: 'burstMe', by });
    }

    /** «Дай» on me: dead at once, dissolved in black light — no body, no things (but the gods' gifts), the old power gone for good. */
    _dieMe(by) {
        const g = this.game, c = g.combat;
        if (!c.enabled) { g.hud?.setVoice?.('🖤 «Дай» попал в вас (здесь не убивает)', true); this.dustLook(g.character.group.position, 2.2, 0.8); return; }
        const p = g.character.group.position;
        this.dustLook(p, 2.2, 0.8);
        this._send({ op: 'dust', p: r3a(p), h: 2.2, r: 0.8, k: 'p', id: this.me });
        g._deathHow = 'annihilate';
        c.die(by, 'die');
        this._note({ ev: 'dieMe', by });
    }

    /** An Electrum tick on me (from the caster's computer): my «Protection» drinks it with its mana, as always. */
    electrumOnMe(by, dmg) {
        const g = this.game, c = g.combat;
        if (c.dead) return;
        const from = this.game.duel?._handOf?.(by, 'right', _w, _d) ? _w : null;
        if (from && c.shieldFactor(from) >= 1 && c._blocked(from, 'Electrum')) return;
        if (c.enabled) c.damage(dmg, by, 'Electrum');
        if (Math.random() < 0.3) g.fx?.spark?.(c.center(_v), 0xbfe6ff, 0.15, _o.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.3);
    }

    // ============================================================ on creatures (host)
    /**
     * (host) A charge reached a creature (after its shield / the Master's dome were asked — except «Дай», which
     * pierces them). o: {src (the caster's hand), ak (0…1 where on the body), point}. @returns true if handled.
     */
    hitCreature(k, c, spell, by, o = {}) {
        if (!c) return false;
        const g = this.game;
        if (spell === 'Die') { this.annihilate(k, c, by); return true; }
        if (k === 'b') { g.books?.hitBird?.(c, 99); return true; } // (a book-bird: any of them knocks it down as a book)
        if (spell === 'Accentric') {
            // (no eyes, no mind to blur: a living tree, a skeleton of the black ship — no effect, and no harm)
            if (k === 't' || (k === 'c' && c.role === 'skeleton')) { this._fizz(c, k, 0xc070ff); this._note({ ev: 'none', k, spell }); return true; }
            this._hurt(k, c, 0.01, 'Accentric', by); // (an attack: it turns on the caster)
            this.confuse(k, c);
            this.dot(k, c, STRONG.Accentric.dps, STRONG.Accentric.total / STRONG.Accentric.dps, 'Accentric', by);
            return true;
        }
        if (spell === 'Pilbidrio') {
            const hp0 = this.hpOf(k, c);
            this._flash(this._center(k, c, _v), 0xfff6c8);
            if (pilbidrioBursts(hp0)) this.burst(k, c, by);
            else this._hurt(k, c, STRONG.Pilbidrio.dmg, 'Pilbidrio', by);
            return true;
        }
        if (spell === 'Electrum') { this._hurt(k, c, STRONG.Electrum.hit, 'Electrum', by); return true; }
        if (isIceCharge(spell)) return this.iceCreature(k, c, spell, by, o);
        return false;
    }

    /**
     * (host) A charge reached a dragon ('D'), the giant spider ('s') or an Ice Castle creature ('I') — their own
     * boltHit asks here first, with the point it touched (`p`): where on the body («Айс Максима»: the head, a leg,
     * the trunk). @returns true when it was one of these spells (handled).
     */
    boltHit(k, c, spell, by, p = null) {
        if (!(STRONG_OR_ICE(spell))) return false;
        if (!this.auth) return false;
        let ak = 0.5, low = false;
        const b = this._bodyOf(k, c);
        if (b && p) {
            const ab = _w.subVectors(b.b, b.a), L2 = ab.lengthSq();
            ak = L2 > 1e-9 ? Math.max(0, Math.min(1, _o.subVectors(p, b.a).dot(ab) / L2)) : 0.5;
            low = p.y < b.a.y + (b.b.y - b.a.y) * ak - b.r * 0.35;
        }
        return this.hitCreature(k, c, spell, by, { ak, low, point: p });
    }

    /** The ice on a creature: frozen whole 10 s, −3/s (Maxima −10/s); a dragon / the spider — Maxima only, by the part. */
    iceCreature(k, c, spell, by, o = {}) {
        const g = this.game, max = spell === 'IceDuelMaxima', I = max ? STRONG.IceMaxima : STRONG.Ice;
        // the cold-proof (the Ice Queen, her monsters, every snowman): no harm, no ice (IceQueen.COLD_KINDS)
        if (k === 'I') return false; // (IceQueen.boltHit answers the cold itself: nothing)
        if (k === 'f' || k === 'o' || k === 't') return false; // (their own answer: the phoenix melts it, the owl darts, the tree does not care)
        // the Master of a tower: never caught off guard — he beats the ice aside
        if (k === 'v' && c.role === 'master') {
            this._fizz(c, k, 0x9fdcff);
            g.castleLife?._say?.(c, 'Меня льдом не застать врасплох!', 3);
            this._hurt(k, c, 0.01, spell, by);
            return true;
        }
        if (k === 'D' || k === 's') {
            if (!max) { this._fizz(c, k, 0x9fdcff); this._tell(by, k === 'D' ? '🧊 Дракона целиком не заморозить — нужна «Айс Максима» в морду, лапу или туловище' : '🧊 Паучиху целиком не заморозить — нужна «Айс Максима» в морду, лапу или туловище'); return true; }
            const part = icePart(o.ak ?? 0.5, !!o.low);
            const P = ICE_PART[part];
            if (part === 'head') { c.iceHeadT = Math.max(c.iceHeadT || 0, P.t); c.blind = Math.max(c.blind || 0, P.t); c.breath = null; c.nextAny = Math.max(c.nextAny || 0, P.t); }
            else { c.iceSlowT = Math.max(c.iceSlowT || 0, P.t); c.iceSlowK = Math.min(c.iceSlowK && c.iceSlowT > 0 ? c.iceSlowK : 1, P.slow); }
            this._note({ ev: 'icePart', k, part });
            g.duel?.ice?.shatter?.(this._center(k, c, _v), 1.4);
            this._hurt(k, c, 0.01, 'IceMaxima', by);
            this.dot(k, c, I.dps, I.time, 'IceMaxima', by);
            this._tell(by, `🧊 ${k === 'D' ? 'Дракон' : 'Паучиха'}: ${P.why}`);
            return true;
        }
        // everybody else: frozen whole
        if (k === 'z') {
            if (!c.isFrozen && c.spawnIceCrystalOnBody) {
                for (let i = 0; i < 16; i++) c.spawnIceCrystalOnBody();
                for (const x of c.iceCrystals.children) x.scale.setScalar(1.8 + Math.random() * 1.2);
            }
            c.freezeProgress = 1;
            c.freeze?.();
            c.stunTimer = Math.max(c.stunTimer || 0, I.time);
        } else {
            c.stunT = Math.max(c.stunT || 0, I.time);
            if (k === 'a' || k === 'v' || k === 'c') g.duel?._encase?.(k === 'c' ? 'c' : k, c.id, I.time);
        }
        this.dot(k, c, I.dps, I.time, max ? 'IceMaxima' : 'Ice', by);
        this._hurt(k, c, 0.01, max ? 'IceMaxima' : 'Ice', by);
        return true;
    }

    /** (host) Accentric's haze on a creature: a minute lost (it reels and stumbles, half its blows fail). */
    confuse(k, c) {
        const T = STRONG.Accentric.time;
        c.accT = T;
        const ck = kindOf(c);
        const ci = this.game.creatureImpact;
        if (ck && ci?._state && ci?._daze) { try { ci._daze(ck, c, ci._state(ck, c), T); } catch (e) { /* (not a body it knows) */ } }
        if (!this.dazed.some((x) => x.c === c)) this.dazed.push({ c, k });
        this._note({ ev: 'confuse', k, id: c.id });
    }

    /** (host) Harm over time: `rate` a second for `left` s (ticks every half second). */
    dot(k, c, rate, left, spell, by) {
        const had = this.dots.find((x) => x.c === c && x.spell === spell);
        if (had) { had.left = Math.max(had.left, left); had.rate = Math.max(had.rate, rate); return; }
        this.dots.push({ k, c, rate, left, spell, by, acc: 0 });
        if (this.dots.length > 200) this.dots.shift();
    }

    /** A creature's health now (Pilbidrio asks before its blow). */
    hpOf(k, c) {
        if (k === 'z') return c.health;
        return c.hp;
    }

    _alive(k, c) {
        if (!c) return false;
        if (k === 'z') return !c.isDead;
        if (k === 't') return !c.isDead;
        if (k === 'b') return c.state !== 'fall';
        return !c.dead;
    }

    /** (host) One blow of `dmg` of `spell` on a creature, through its own system (its rules, its network). */
    _hurt(k, c, dmg, spell, by) {
        const g = this.game;
        switch (k) {
            case 'z': if (dmg >= 0.5) g.damageZombie?.(c, dmg, false, null, by); return;
            case 'v': g.castleLife?.hit?.(c, dmg, null, by, { spell: true, kind: spell }); return;
            case 'c': g.ships?.crew?.hit?.(c, dmg, null, by, { spell: true, kind: spell }); return;
            case 'a': if (dmg >= 0.5) g.animals?.hit?.(c, dmg, null, by); else g.animals?.guards?.attacked?.(c, by); return;
            case 't': g.livingTrees?.hit?.(c, dmg, spell, by); return;
            case 's': g.spiders?.hit?.(c, dmg, spell, by); return;
            case 'D': g.dragons?.hit?.(c, dmg, spell, by); return;
            case 'I': g.iceCastle?.hit?.(c, dmg, spell, by); return;
            case 'f': g.phoenixes?.hit?.(c, dmg, spell, by); return;
            case 'o': g.owls?.hit?.(c, dmg, spell, by); return;
            case 'g': g.gargoyles?.hit?.(c, dmg, spell, by); return; // (an infernal gargoyle: «Дай» shatters it, the strong charges hurt, «Авада» does not act — GargoyleRules.harmOf)
            case 'b': g.books?.hitBird?.(c, 99); return;
        }
    }

    /** Where a creature's middle is. */
    _center(k, c, out) {
        const b = this._bodyOf(k, c);
        return b ? out.copy(b.a).lerp(b.b, 0.5) : out.set(c.x || 0, (c.y || 0) + 2, c.z || 0);
    }

    _bodyOf(k, c) { return this.game.duel?._bodyOf?.(k, c.id, _body) || null; }

    _flash(p, col) { const fx = this.game.fx; for (let i = 0; i < 24; i++) fx?.spark?.(p, i % 3 ? col : 0xffffff, 0.16, _o.set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8), 0.5); }
    _fizz(c, k, col) { this._flash(this._center(k, c, _t), col); }
    _tell(by, text) {
        const g = this.game;
        if (by === this.me || by === 'local') g.hud?.setVoice?.(text, true);
    }

    // ============================================================ Pilbidrio's burst
    /** (host) The body blown apart: dead, its pieces fly; no body is left (its things fall as they do). */
    burst(k, c, by) {
        const g = this.game;
        const b = this._bodyOf(k, c);
        const p = b ? _v.copy(b.a).lerp(b.b, 0.5).clone() : this._center(k, c, _v).clone();
        const s = b ? Math.max(0.6, Math.min(4, (b.a.distanceTo(b.b) / 2 + b.r) / 1.6)) : 1;
        const pal = this._palette(k, c);
        c.burst = true; // (Death: no body — the pieces are it)
        this._kill(k, c, 'Pilbidrio', by);
        this.burstLook(p, s, pal);
        this._vanish(k, c.id);
        this._send({ op: 'burst', p: r3a(p), s: Math.round(s * 100) / 100, pal, k, id: c.id });
        this._note({ ev: 'burst', k, id: c.id });
    }

    _palette(k, c) {
        if (k === 'z') return 'zombie';
        if (k === 'c' && c.role === 'skeleton') return 'bone';
        if (k === 't') return c.skel ? 'bone' : 'wood';
        if (k === 'I') return 'ice';
        if (k === 'D') return 'dragon';
        if (k === 's') return 'spider';
        if (k === 'f' || k === 'o' || k === 'b') return 'bird';
        return 'flesh';
    }

    /** (host) Dead now, whatever it had: the blow of its kind (pierce: no armour, no shield). */
    _kill(k, c, spell, by) {
        const g = this.game;
        const BIG = 1e7;
        switch (k) {
            case 'z': g.damageZombie?.(c, BIG, false, null, by); if (!c.isDead) c.die?.(); return;
            case 'v': g.castleLife?.hit?.(c, 0, null, by, { pierce: true, spell: true, kind: spell }); return;
            case 'c': g.ships?.crew?.hit?.(c, 0, null, by, { pierce: true, spell: true, kind: spell }); return;
            case 'a': g.animals?.hit?.(c, BIG, null, by); return;
            case 't': g.livingTrees?.hit?.(c, BIG, spell, by); return;
            default: this._hurt(k, c, BIG, spell, by);
        }
    }

    /** The look of a body blown apart (every computer): pieces of it in its colours, blood, a white flash. */
    burstLook(p, s = 1, pal = 'flesh') {
        const fx = this.game.fx;
        if (!fx) return;
        const cols = PALETTE[pal] || PALETTE.flesh;
        fx.lightFlash?.(p, 0xfff6c8, 4, 0.3, 24);
        const n = Math.round(10 + 6 * Math.min(3, s));
        for (let i = 0; i < n; i++) {
            // (the head, the arms, the legs, pieces of the trunk: bigger cubes first)
            const size = (i < 5 ? 0.42 : 0.16 + Math.random() * 0.22) * s;
            fx.debris?.spawn?.(p.x + (Math.random() - 0.5) * s, p.y + (Math.random() - 0.3) * s, p.z + (Math.random() - 0.5) * s,
                (Math.random() - 0.5) * 14, 4 + Math.random() * 9, (Math.random() - 0.5) * 14, cols[i % cols.length], size, 4 + Math.random() * 2, { shrink: 0.05, fade: false, spin: 12 });
        }
        if (pal === 'flesh' || pal === 'zombie' || pal === 'dragon' || pal === 'spider') for (let i = 0; i < 3; i++) fx.blood?.(p, 20);
        for (let i = 0; i < 30; i++) fx.spark?.(p, i % 2 ? 0xfff6c8 : 0xffffff, 0.2, _o.set((Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12), 0.5);
    }

    // ============================================================ «Дай»
    /**
     * (host) «Дай» on a creature: dead at once, whoever it is (but a titan), dissolved in black light — no body,
     * no remains, its things gone; the gods' gifts fall to the ground (the Ice Rod: IceQueen drops it).
     */
    annihilate(k, c, by) {
        const g = this.game;
        if (isTitan(c)) { this._fizz(c, k, 0x5a00a0); this._tell(by, '🖤 ' + TITAN_WHY); return false; }
        if (k === 'b') { g.books?.hitBird?.(c, 99); return true; } // (a book-bird is no creature: it only falls, as a book)
        const b = this._bodyOf(k, c);
        const base = b ? (b.a.y < b.b.y ? b.a : b.b) : this._center(k, c, _t);
        const p = _w.set(base.x, base.y - (b ? b.r : 1), base.z).clone();
        const h = b ? Math.max(1, Math.abs(b.b.y - b.a.y) + 2 * b.r) : 2.2, r = b ? Math.max(0.5, b.r) : 0.8;
        c.annihilated = true;
        c.burst = true; // (no body)
        this._kill(k, c, 'Die', by);
        this.dustLook(p, h, r);
        this._vanish(k, c.id);
        this._send({ op: 'dust', p: r3a(p), h: Math.round(h * 10) / 10, r: Math.round(r * 10) / 10, k, id: c.id });
        this._note({ ev: 'die', k, id: c.id });
        return true;
    }

    /**
     * The black light eating a body away (every computer): dark ash rising off it from the feet up, violet
     * sparks, a dark pulse — then nothing. `p`: the feet; `h`: its height; `r`: its width.
     */
    dustLook(p, h = 2.2, r = 0.8) {
        const fx = this.game.fx;
        if (!fx) return;
        fx.lightFlash?.(_o.set(p.x, p.y + h / 2, p.z), 0x5a00a0, 3, 0.6, 20);
        const n = Math.round(30 + 18 * Math.min(4, h * r));
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()), y = p.y + h * (i / n);
            // (black flakes floating up: lit cubes, not added light — black stays black)
            fx.debris?.spawn?.(p.x + Math.cos(a) * rr, y, p.z + Math.sin(a) * rr, (Math.random() - 0.5) * 1.2, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.2,
                i % 4 ? 0x07020c : 0x2a0a3a, 0.06 + Math.random() * 0.12, 1.5 + Math.random() * 1.5, { shrink: 0.06, fade: true, spin: 6, gravity: 2.5 });
            if (i % 2) fx.spark?.(_o.set(p.x + Math.cos(a) * rr, y, p.z + Math.sin(a) * rr), i % 3 ? 0x6a1ab0 : 0x2a004a, 0.12, _d.set((Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5), 1.2);
        }
    }

    /** The «Дай» was cast near people: every ordinary creature near runs in terror (only the bosses stand). */
    terror(pos, by) {
        const g = this.game;
        if (!this.auth) { this._send({ op: 'terror', p: r3a(pos), by }, false); return; }
        const R = 36;
        g.castleLife?.alarm?.(pos, 'die', by, 18);
        for (const v of g.castleLife?.targets?.() || []) {
            if (v.dead || v.role === 'king' || v.role === 'master' || v.servantOf != null) continue;
            if (Math.hypot(v.x - pos.x, v.z - pos.z) > R) continue;
            v.foe = null; v.path = null;
            v.firePanic = true; v.fireAt = { x: pos.x, z: pos.z }; v.fireT = Math.max(v.fireT || 0, 9);
            if (Math.random() < 0.4) g.castleLife?._say?.(v, ['Спасайтесь!', 'Чёрная магия!', 'Бегите!', 'Это смерть!'][Math.floor(Math.random() * 4)], 2);
        }
        for (const a of g.animals?.list || []) {
            if (a.dead || a.rider || a.lev || a.form) continue;
            if (a.group.position.distanceTo(pos) > R) continue;
            a.state = 'flee'; a.attacker = by; a.stateT = 10;
        }
    }

    /** A body that is gone (burst or dissolved): hidden here (every computer). */
    _vanish(k, id) {
        const g = this.game;
        if (k === 'z') { const z = g.zombieById?.get(id); if (z) { z.isDead = true; z.isDying = false; z.group.visible = false; z.corpseTimer = 0; } return; }
        if (k === 'v') { const v = g.castleLife?.byId?.get(id); if (v) { v.bodyMoved = true; v.burst = true; if (v.group) v.group.visible = false; } return; }
        if (k === 'c') { const v = g.ships?.crew?.byId?.get(id); if (v) { v.burst = true; if (v.group) v.group.visible = false; } return; }
        if (k === 'a') { const a = g.animals?.byId?.get(id); if (a) { a.burst = true; if (a.dead) g.animals._remove?.(a); else if (a.group) a.group.visible = false; } return; }
        if (k === 't') { const t = g.livingTrees?.byId?.get(id); if (t?.model && t.annihilated) t.model.visible = false; return; }
        if (k === 's') { const s = g.spiders?.list?.find?.((x) => x.id === id); if (s?.model) s.model.visible = false; return; }
        if (k === 'D') { const d = g.dragons?.list?.find?.((x) => x.id === id); if (d?.model) { d.model.visible = false; if (d.shadow) d.shadow.visible = false; d.burst = true; } return; }
        if (k === 'I') { const c = g.iceCastle?.list?.find?.((x) => x.id === id); if (c?.model) c.model.visible = false; return; }
        // (a player: their own computer ends their life — their avatar is the network's, it comes back when they do)
    }

    // ============================================================ «Электром»
    /** My Electrum charge hit (Duel._end / remoteEnd): now the lightning is held on the target. */
    startElectrum(side, tk, tid, at = null) {
        const g = this.game;
        if (tk === 'n' || tid == null) return;
        // (tk 'W': a house's protection — the lightning is held on one spot of it, `at`)
        this.electrum = { side, tk, tid, t: 0, off: 0, acc: 0, wand: !!g.wandSide?.(), ...(tk === 'W' && at ? { at: new THREE.Vector3().copy(at) } : {}) };
        this._send({ op: 'el', by: this.me, side, tk, tid, ...(this.electrum.at ? { at: this.electrum.at.toArray() } : {}) });
        this._note({ ev: 'elStart', tk, tid });
    }

    /** The lightning breaks off (a fall, a stun, the wand knocked out, «стоп», the hand off it, no mana). */
    stopElectrum(why = 'stop') {
        if (!this.electrum) return false;
        this.electrum = null;
        this._send({ op: 'elx', by: this.me });
        this._note({ ev: 'elStop', why });
        const say = { hand: '⚡ Рука ушла с цели — молния оборвалась', mana: '⚡ Кончилась мана — молния погасла', wand: '⚡ Палочку выбили — молния оборвалась', gone: '⚡ Цели больше нет — молния погасла', arm: '⚡ Рука опущена — молния оборвалась' }[why];
        if (say) this.game.hud?.setVoice?.(say, true);
        return true;
    }

    _electrumUpdate(dt) {
        const g = this.game, E = this.electrum, duel = g.duel;
        if (!E || !duel) return;
        E.t += dt;
        const c = g.combat;
        if (c.dead || g.isDeadLocal || c.frozen || c.stunned) { this.stopElectrum('focus'); return; }
        if (E.wand && !g.wandSide?.()) { this.stopElectrum('wand'); return; }
        if (g.character?.isArmRaised && !g.character.isArmRaised(E.side)) { this.stopElectrum('arm'); return; }
        const tp = E.at ? _t.copy(E.at) : duel._targetPos({ tk: E.tk, tid: E.tid }, _t);
        if (!tp || (E.at && !g.wards?.list?.has(E.tid))) { this.stopElectrum('gone'); return; }
        duel._myRay(E.side, _o, _d);
        g.castOrigin?.(E.side, _o);
        const to = _w.subVectors(tp, _o);
        const dist = to.length();
        const on = dist < STRONG.Electrum.reach && _d.angleTo(to.normalize()) < STRONG.Electrum.cone;
        E.off = on ? 0 : E.off + dt;
        if (E.off > 0.35) { this.stopElectrum('hand'); return; }
        if (!c.drain(STRONG.Electrum.drain * dt, dt)) { this.stopElectrum('mana'); return; }
        duel._drawBolt('Electrum', _o, tp, this.me);
        this._crackle(tp);
        if (!on) return;
        E.acc += dt;
        const T = STRONG.Electrum.tick;
        while (E.acc >= T) { E.acc -= T; this._tick(this.me, E.tk, E.tid, STRONG.Electrum.dps * T); }
    }

    _crackle(p) {
        if (Math.random() < 0.5) this.game.fx?.spark?.(p, Math.random() < 0.5 ? 0xbfe6ff : 0xffffff, 0.14, _v.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.25);
    }

    /** One Electrum tick: who decides it gets it (the player hit — his computer; a creature — the host). */
    _tick(by, tk, tid, dmg) {
        const g = this.game;
        if (tk === 'W') {
            const at = this.electrum?.at;
            if (this.auth) g.wards?.electrumTick(tid, dmg * (WARD.ELEC_DPS / STRONG.Electrum.dps), by, at);
            else this._send({ op: 'et', by, tk, tid, dmg, at: at?.toArray() }, false);
            return;
        }
        if (tk === 'p') {
            if (tid === this.me) this.electrumOnMe(by, dmg);
            else this._send({ op: 'et', to: tid, by, tk, tid, dmg }, true);
            return;
        }
        if (this.auth) this._tickCreature(by, tk, tid, dmg);
        else this._send({ op: 'et', by, tk, tid, dmg }, false);
    }

    _tickCreature(by, tk, tid, dmg) {
        const g = this.game, duel = g.duel;
        const c = tk === 'z' ? g.zombieById?.get(tid) : tk === 's' ? g.spiders?.byId?.(tid) : tk === 'D' ? g.dragons?.byId?.(tid) : tk === 'I' ? g.iceCastle?.byId?.(tid) : duel?._creature?.(tk, tid);
        if (!c || !this._alive(tk, c)) return;
        // (a wizard's shield / the Master's dome drinks it with its mana)
        if (tk === 'v' && duel?._casterAt && g.castleLife?.wardOff?.(c, duel._casterAt(by, c), 'Electrum')) return;
        this._hurt(tk, c, dmg, 'Electrum', by);
    }

    /** Others' held lightning, drawn here from their hand to their target. */
    _beamsUpdate() {
        const duel = this.game.duel;
        if (!duel) return;
        for (const [by, b] of this.beams) {
            const tp = b.at ? _t.copy(b.at) : duel._targetPos({ tk: b.tk, tid: b.tid }, _t);
            if (!tp || !duel._handOf(by, b.side, _o, _d)) { if (++b.miss > 120) this.beams.delete(by); continue; }
            b.miss = 0;
            duel._drawBolt('Electrum', _o, tp, by);
            this._crackle(tp);
        }
    }

    // ============================================================ network
    onNet(m) {
        const g = this.game;
        if (!m || typeof m.op !== 'string') return;
        const sender = m.from && m.from !== 'H' ? m.from : m.by;
        switch (m.op) {
            case 'el': if (m.by !== this.me && this.beams.size < 16) this.beams.set(m.by, { side: m.side === 'left' ? 'left' : 'right', tk: String(m.tk), tid: m.tid, miss: 0, ...(m.tk === 'W' && Array.isArray(m.at) ? { at: new THREE.Vector3().fromArray(m.at) } : {}) }); break;
            case 'elx': this.beams.delete(m.by); break;
            case 'et': {
                const dmg = Math.max(0, Math.min(10, +m.dmg || 0));
                if (m.tk === 'p') { if (m.to === this.me) this.electrumOnMe(sender, dmg); break; }
                if (m.tk === 'W') { if (this.auth) this.game.wards?.electrumTick(m.tid, dmg * (WARD.ELEC_DPS / STRONG.Electrum.dps), sender, Array.isArray(m.at) ? _v.fromArray(m.at) : null); break; }
                if (this.auth) this._tickCreature(sender, m.tk, m.tid, dmg);
                break;
            }
            case 'burst': if (Array.isArray(m.p)) { this.burstLook(_v.fromArray(m.p), Math.min(4, +m.s || 1), String(m.pal)); this._vanish(m.k, m.id); } break;
            case 'dust': if (Array.isArray(m.p)) { this.dustLook(_v.fromArray(m.p), Math.min(12, +m.h || 2), Math.min(4, +m.r || 0.8)); this._vanish(m.k, m.id); } break;
            case 'terror': if (this.auth && Array.isArray(m.p)) this.terror(_v.fromArray(m.p), sender); break;
        }
    }

    // ============================================================ frame
    update(dt) {
        const g = this.game;
        this._electrumUpdate(dt);
        this._beamsUpdate();
        this._meUpdate(dt);
        if (!this.auth) return;
        // harm over time
        for (let i = this.dots.length - 1; i >= 0; i--) {
            const d = this.dots[i];
            if (!this._alive(d.k, d.c) || d.left <= 0) { this.dots.splice(i, 1); continue; }
            d.left -= dt; d.acc += dt;
            if (d.acc >= 0.5) { d.acc -= 0.5; this._hurt(d.k, d.c, d.rate * 0.5, d.spell, d.by); }
        }
        // Accentric's haze runs out; the ice on a dragon / the spider melts
        for (let i = this.dazed.length - 1; i >= 0; i--) {
            const x = this.dazed[i];
            x.c.accT = Math.max(0, (x.c.accT || 0) - dt);
            if (x.c.accT <= 0 || !this._alive(x.k, x.c)) { x.c.accT = 0; this.dazed.splice(i, 1); }
        }
    }

    /** On me: Accentric's blur and its strange sounds, its −5/s; the ice biting while it holds. */
    _meUpdate(dt) {
        const g = this.game, c = g.combat;
        const A = this.accMe;
        if (A) {
            A.t += dt;
            const k = c.dead || g.isDeadLocal ? 0 : accentricK(A.t);
            if (k <= 0) { this.accMe = null; this._blur(0); }
            else {
                this._blur(k, A.t);
                if (c.enabled && A.dealt < STRONG.Accentric.total) {
                    A.acc += dt;
                    if (A.acc >= 0.5) { A.acc -= 0.5; A.dealt += STRONG.Accentric.dps * 0.5; c.damage(STRONG.Accentric.dps * 0.5, A.by, 'Accentric'); }
                }
                this._weirdT -= dt;
                if (this._weirdT <= 0) { this._weirdT = 1.5 + Math.random() * 3; g.sound?.playSpellFx?.('fxAccWeird', null, 0.35 + 0.4 * k, 0.6 + Math.random() * 0.8); }
            }
        }
        const I = this.iceMe;
        if (I) {
            I.left -= dt;
            if (I.left <= 0 || !c.frozen || c.dead) { this.iceMe = null; return; }
            I.acc += dt;
            if (I.acc >= 0.5 && c.enabled) { I.acc -= 0.5; c.damage(I.rate * 0.5, I.by, 'iceBite'); }
        }
    }

    /** The picture swims: a blur (and a slight sway of the colours) on the game's canvas — set ~10 times a second. */
    _blur(k, t = 0) {
        const el = this.game.renderer?.domElement;
        if (!el?.style) return;
        const now = performance.now();
        if (k > 0 && now - this._blurAt < 100) return;
        this._blurAt = now;
        if (k <= 0) { if (this._blurOn) { el.style.filter = ''; this._blurOn = false; } return; }
        const px = (1.5 + 2.5 * k * (0.6 + 0.4 * Math.sin(t * 1.7))).toFixed(1);
        el.style.filter = `blur(${px}px) saturate(${(1 + 0.5 * k).toFixed(2)}) hue-rotate(${Math.round(20 * k * Math.sin(t * 0.9))}deg)`;
        this._blurOn = true;
    }

    /** Death / a new life: nothing of these left on me. */
    reset() {
        this.accMe = null;
        this.iceMe = null;
        this.stopElectrum('dead');
        this._blur(0);
    }
}

const r3a = (p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100];

/** Is this kind of harm cold (the Ice Queen's immunity — IceQueen.COLD_KINDS)? (re-exported for the tables' tests) */
export const coldKind = (k) => isCold(k);
/** A thing the Die leaves (only the gods' gifts survive it). */
export const survivesDie = (it) => isGodGift(it);
