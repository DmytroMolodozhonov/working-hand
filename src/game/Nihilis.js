/**
 * Nihilis.js — «Nihilis Atra»: the scattering of black magic (rules, numbers and the «who/what» table: NihilisRules.js). WHITE magic, from a scroll.
 *
 * Point the wand and say «Nihilis Atra» (40 mana): a cone of light goes out of the wand (like «Wind»: everything in it, not one target). Whatever lives
 * by black magic falls to pieces; the black mages are only hurt (60+: badly) and fear it; a black mage's «Protection Maxima» dome shatters.
 *
 * Every computer plays the light and breaks the black pentagrams in the cone (the same cone from the same message: 'nhl'); the host does the world
 * (trees, skeletons, gargoyles, the people, the sailors); each computer does its OWN hero (a black mage hurt, a dome shattered, a monster form or an
 * Imperius mind let go, a «слом защиты» mark taken off) — the caster is never hit by their own light.
 */
import * as THREE from 'three';
import { NIHIL, NIHILIS_TARGETS, inCone, blackWound, woundHp, scatters } from './NihilisRules.js';
import { PENTAGRAMS as TABLE } from './Pentagrams.js';
import { castingHand } from './WandAim.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const LIGHT = [0xffffff, 0xfff3c4, 0xbfe9ff, 0xffe08a, 0xe8f6ff];
const PIECES = [0x2a2a2a, 0x3a2f2a, 0x4a4a52, 0x1c1c1c];
const pick = (a) => a[(Math.random() * a.length) | 0];

export class Nihilis {
    constructor(game) {
        this.game = game;
        this._at = -1e9;
    }

    get auth() { return this.game.authority; }

    /** Voice: «Nihilis Atra» said. `aim` ({origin, dir}) is for tests. */
    cast(isFinal, aim = null) {
        const g = this.game;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!isFinal) return null; // (two words: the phrase is not whole yet)
        const now = performance.now();
        if (now - this._at < NIHIL.COOLDOWN * 1000) return null;
        const hand = aim ? { side: 'right', origin: aim.origin, dir: aim.dir } : castingHand(g);
        if (!hand || (!aim && !g.character.isArmRaised(hand.side))) return hint('✨ Поднимите палочку и направьте её туда, где чёрная магия, — и скажите «Nihilis Atra»');
        const tired = g.combat.check(NIHIL.NAME);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay(NIHIL.NAME);
        this._at = now;
        _o.copy(hand.origin); _d.copy(hand.dir).normalize();
        this.fire(_o, _d, g.localId);
        g.sync?.nihilis?.(_o, _d);
        g.mana?.success?.(NIHIL.NAME);
        g.perf?.note?.('✨ Nihilis Atra: чёрная магия рассеяна конусом');
        return NIHIL.NAME;
    }

    /** One scattering (mine or another's — the same on every computer). */
    fire(o, d, by) {
        const g = this.game;
        const O = o.clone(), D = d.clone().normalize();
        this._light(O, D);
        g.invis?.noted?.(by); // (a spell gives an invisible caster away: about where)
        this._marks(O, D);
        this._me(O, D, by);
        g.ghosts?.exorcise?.({ o: O, d: D, range: NIHIL.RANGE, by }); // (hook: the ghost castle comes later)
        if (this.auth) this._world(O, D, by);
    }

    // ------------------------------------------------------------ the light (every computer)
    _light(o, d) {
        const g = this.game, fx = g.fx;
        if (!fx) return;
        _u.set(0, 1, 0); if (Math.abs(d.y) > 0.95) _u.set(1, 0, 0);
        const sx = _q.crossVectors(d, _u).normalize().clone(), sy = _w.crossVectors(sx, d).normalize().clone();
        // the stream: grains of light flow out along the cone, widening
        for (let i = 0; i < 150; i++) {
            const t = Math.pow(Math.random(), 0.8) * NIHIL.RANGE * 0.85, rr = (NIHIL.R0 + t * NIHIL.SPREAD) * Math.sqrt(Math.random()), a = Math.random() * 6.283;
            _p.copy(o).addScaledVector(d, t * 0.4).addScaledVector(sx, Math.cos(a) * rr * 0.4).addScaledVector(sy, Math.sin(a) * rr * 0.4);
            _c.copy(d).multiplyScalar(14 + Math.random() * 20).addScaledVector(sx, Math.cos(a) * rr * 0.9).addScaledVector(sy, Math.sin(a) * rr * 0.9);
            fx.spark(_p, pick(LIGHT), 0.12 + Math.random() * 0.2, _c, 0.5 + Math.random() * 0.7);
        }
        // the edges of the cone: bright threads of light
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * 6.283 + Math.random() * 0.3, R = NIHIL.R0 + NIHIL.RANGE * NIHIL.SPREAD;
            _p.copy(o).addScaledVector(d, NIHIL.RANGE).addScaledVector(sx, Math.cos(a) * R * 0.85).addScaledVector(sy, Math.sin(a) * R * 0.85);
            fx.straightBeam?.(o, _p, 0.05, pick(LIGHT), 0.55, 0.28, null, THREE.AdditiveBlending);
        }
        fx.lightFlash?.(o, 0xfff3c4, 4, 0.45, 26);
        g.sound?.playSpellFxAt?.('fxNihilis', o, 1, 1, 30);
    }

    /** Dust and falling pieces where something dark falls apart (every computer sees it where the host does it). */
    _crumble(at, big = 1) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < 26 * big; i++) {
            _c.set((Math.random() - 0.5) * 5, 1 + Math.random() * 5, (Math.random() - 0.5) * 5);
            fx.spark(at, pick(LIGHT), 0.12 + Math.random() * 0.14, _c, 0.7 + Math.random() * 0.7);
        }
        for (let i = 0; i < 14 * big; i++) fx.debris?.spawn(at.x + (Math.random() - 0.5) * 1.2, at.y + Math.random() * 1.6, at.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6, pick(PIECES), 0.12 + Math.random() * 0.22, 2, { shrink: 0.1, fade: false, spin: 8 });
        fx.lightFlash?.(at, 0xfff3c4, 2.2 * big, 0.3, 14);
    }

    // ------------------------------------------------------------ the black pentagrams (every computer: the same cone, the same marks)
    _marks(o, d) {
        const P = this.game.pentagranium;
        if (!P?.marks?.size) return;
        for (const m of [...P.marks.values()]) {
            if (!scatters(TABLE[m.pent])) continue;
            if (inCone(o, d, _p.set(m.x, m.y, m.z), m.r) < 0) continue;
            this._crumble(_c.set(m.x, m.y + 0.3, m.z).clone(), 1.4);
            P._remove(m.id, 'nihilis'); // (the lines go out; a rite on it breaks — Pentagranium._remove)
        }
    }

    // ------------------------------------------------------------ my own hero
    _me(o, d, by) {
        const g = this.game, ch = g.character;
        if (!ch || by === g.localId || by === 'local') return; // (never the caster's own light on the caster)
        // an «Империус» mind (the plain one: black magic) in a creature the light reaches is sent home to its body
        if (g.imperius?.active && g.imperius.name === 'Imperius') { const ip = g.imperius.bodyPosition?.(_w); if (ip && inCone(o, d, ip, 1) >= 0) g.imperius.stop?.('lost'); }
        if (g.combat?.dead || g.isDeadLocal) return;
        const me = g.combat?.center ? g.combat.center(_c) : _c.copy(ch.group.position);
        if (inCone(o, d, me, 0.8) < 0) return;
        const lvl = g.dark?.level || 0;
        const c = g.combat;
        // the form of the monster falls apart (the man inside lives)
        if (g.monster?.active) { g.monster.end?.('nihilis'); g.hud?.setVoice?.('✨ Свет «Nihilis Atra» рассеял монстра — вы снова человек', true); }
        // «слом защиты»: the black mark on me goes out
        if (g.breakward?.marked) { g.breakward.onDeath?.(); g.hud?.setVoice?.('✨ Метка «слом защиты» рассеяна', true); }
        const wound = blackWound(lvl);
        if (!wound) return; // (a plain mage: white magic does him no harm)
        // a black mage's «Protection Maxima» (not the gods' dome) shatters
        if (c?.shield?.type === 2 && !c.shield.gods) c._shatter?.('✨ Чужой свет рассеял ваш купол «Protection Maxima»', true);
        const hp = woundHp(wound, g.maxHP || c?.maxHp || 20);
        g.hud?.setVoice?.(wound === 'heavy' ? '✨ Свет «Nihilis Atra» жжёт вас: чёрная магия в вас горит!' : '✨ Свет «Nihilis Atra» обжёг вас', true);
        for (let i = 0; i < 24; i++) g.fx?.spark(_c, pick(LIGHT), 0.14, _w.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.8);
        if (c?.enabled) c.damage(hp, by, NIHIL.NAME);
        else g.damageLocalPlayer?.(hp);
    }

    // ------------------------------------------------------------ the world (the host)
    _world(o, d, by) {
        const g = this.game;
        const bodies = g.duel?._bodies?.(null) || [];
        for (const b of bodies) {
            if (b.kind === 'p' || b.kind === 'b') continue; // (players do their own; the book-birds are white magic)
            const mid = _p.copy(b.a).add(b.b).multiplyScalar(0.5);
            const inC = inCone(o, d, mid, b.r || 1) >= 0 || inCone(o, d, b.a, b.r || 1) >= 0 || inCone(o, d, b.b, b.r || 1) >= 0;
            const cr = b.kind === 'z' || b.kind === 's' || b.kind === 'D' ? null : g.duel?._creature?.(b.kind, b.id);
            // black mages (60+) near the caster run from it, cone or not — they know what it is
            if (b.kind === 'v' && cr && !cr.dead && (cr.dark || 0) >= NIHIL.FEAR_LEVEL && !inC && mid.distanceTo(o) < NIHIL.SCARE_R) this._scare(cr, o);
            if (!inC) continue;
            const dir = _q.set(mid.x - o.x, 0, mid.z - o.z).normalize().clone();
            if (b.kind === 't' && cr && !cr.isDead) { this._crumble(mid.clone(), 1.2); g.livingTrees?.hit?.(cr, NIHIL.BIG, NIHIL.NAME, by); continue; } // (a living tree / a skeleton risen at a grave)
            if (b.kind === 'g' && cr && !cr.dead) { this._crumble(mid.clone(), 1.2); g.gargoyles?.hit?.(cr, NIHIL.BIG, NIHIL.NAME, by); continue; } // (infernal: falls to dust)
            if (b.kind === 'c' && cr && !cr.dead) { // (the black ship's crew)
                if (cr.role === 'skeleton') { this._crumble(mid.clone(), 1.1); g.ships?.crew?.hit?.(cr, NIHIL.BIG, dir, by, { spell: true, kind: NIHIL.NAME }); }
                else if (cr.role === 'blackbeard') { // (a cursed living captain: badly hurt, not killed)
                    g.ships?.crew?.hit?.(cr, woundHp('blackbeard', cr.maxHp || cr.hp || 30), dir, by, { spell: true, kind: NIHIL.NAME });
                    this._crumble(mid.clone(), 0.4);
                }
                continue;
            }
            if (b.kind === 'v' && cr && !cr.dead) { // (castle people: only a black mage is touched)
                const wound = blackWound(cr.dark || 0);
                if (!wound) continue;
                g.castleLife?.wizards?.fight?.breakDome?.(cr); // (a black mage's «Protection Maxima»)
                g.castleLife?.hit?.(cr, woundHp(wound, cr.maxHp || 20), dir, by, { spell: true, magic: true, kind: NIHIL.NAME });
                if (wound === 'heavy') this._scare(cr, o);
                this._crumble(mid.clone(), 0.5);
            }
            // zombies, animals, the spider, dragons, phoenixes, owls, the Ice Castle: nothing (NIHILIS_TARGETS says why)
        }
    }

    /** A black mage (60+) takes fright: he runs from the caster (his own «fear» — as from fire). */
    _scare(v, from) {
        const L = this.game.castleLife;
        if (!L?.fear) return;
        L.fear(v, from.x, from.z, 1, 0.5);
        v.firePanic = true;
        v.fireT = Math.max(v.fireT || 0, 5);
        L.alog?.decision?.(v, 'боюсь «Nihilis Atra»: чёрный маг убегает от света');
    }

    // ------------------------------------------------------------ network
    /** Another player's scattering ('nhl'). */
    onNet(by, m) {
        if (!m || !Array.isArray(m.o) || !Array.isArray(m.d)) return;
        const o = m.o.map(Number), d = m.d.map(Number);
        if (o.some((x) => !Number.isFinite(x)) || d.some((x) => !Number.isFinite(x))) return;
        const dir = new THREE.Vector3(d[0], d[1], d[2]);
        if (dir.lengthSq() < 1e-6) return;
        this.fire(new THREE.Vector3(o[0], o[1], o[2]), dir, by);
    }

    /** For Game.prewarm: nothing of its own (sparks, beams and the flash light are the shared ones). */
    sampleModels() { return []; }
}

export { NIHILIS_TARGETS };
