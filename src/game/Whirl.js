/**
 * Whirl.js — «Spiralis» («Спиралис»): the beam clash taken over and whirled (the rules and the author's words: WhirlRules.js).
 *
 *   word (in my clash)   → 500 mana; the host takes the clash over (a guest asks it: 'dwhirlreq'): both beams are taken off the wands, both spells are kept; everybody draws the whirl (`dwhirl start`)
 *   the swing            → my computer watches the wand hand: it must go on (WhirlRules.stepWhirl); the ribbon of both colours whirls along the wand's trail
 *   release / backfire   → aimed at him and still: the TWO spells leave my wand as a twin charge at the opponent (two bolts of one place, one flight: they cannot clash with each other);
 *                          anything else: both spells hit me (applyToMe, as a lost clash: no armour or robe turns them away). Everybody is told (`dwhirl end`).
 *
 * «А если»: I die / leave / my hand is lost in a whirl — it ends as a backfire's nothing (no spells on a dead hero); the opponent dies / leaves meanwhile — the beams have nobody to go at: let go into the air, nothing
 * hits; a guest's word reaches the host late and the clash is over — nothing is taken, the mana is given back; two whirls in one clash — the host takes only the first; «Дай» — refused with the reason; a hand off the
 * opponent when taken over — the clash is as it is: taken the same; Creative's endless mana — no price; a whirl with no clash left (a clash ended a moment earlier) — «нет дуэли».
 */
import * as THREE from 'three';
import { SegmentPool } from '../fx/Particles.js';
import { castingHand } from './WandAim.js';
import { WHIRL, newWhirl, stepWhirl, attackNow, aimedAt, whirlRefusal } from './WhirlRules.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();

export class Whirl {
    constructor(game) {
        this.game = game;
        this.states = new Map(); // casterId → {by, side, opp, oppKind, spells: [mine, his], marks: [hexA, hexB], S, trail: [], trailT, t, ...}
        this.pools = null;
        this._sayAt = -1e9;
    }

    /** My whirl (null: none). */
    get mine() { return this.states.get(this.game.localId) || null; }

    _pool(i) {
        if (!this.pools) {
            const mk = (c) => new SegmentPool(this.game.scene, { capacity: 140, radius: 0.13, color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
            this.pools = [mk(0xff4a8a), mk(0x4ab0ff), mk(0xffffff)];
        }
        return this.pools[i];
    }

    sampleMeshes() { this._pool(0); return []; }

    // ============================================================ the word (my side)
    cast(isFinal) {
        const g = this.game, duel = g.duel;
        if (!isFinal) return null;
        const say = (t) => { g.hud.setVoice(t, true); return null; };
        if (this.mine) return null;
        const c = duel?.clashes.find((x) => x.a.by === duel.me || x.b.by === duel.me);
        if (!c) return say('🌀 «Спиралис» колдуют только в дуэли лучей — когда ваши лучи уже сошлись');
        const mineA = c.a.by === duel.me;
        const [mine, his] = mineA ? [c.a, c.b] : [c.b, c.a];
        const why = whirlRefusal(mine.spell, his.spell, g.combat?.maxFatigue ?? 100);
        if (why) return say('🌀 ' + why);
        const tired = g.combat.check('Spiralis');
        if (tired) return say(tired);
        g.combat.pay('Spiralis');
        if (duel._referee()) this._takeOver(c, duel.me, mine.side); else g.sync?.net?.send({ t: 'dwhirlreq', by: duel.me, a: c.a.id, b: c.b.id, side: mine.side }, true);
        return 'Spiralis';
    }

    /** (the host) a guest asks to take the clash over. */
    onReq(m) {
        const duel = this.game.duel;
        if (!duel?._referee() || this.states.has(m.by)) return;
        const c = duel.clashes.find((x) => x.a.id === m.a && x.b.id === m.b && (x.a.by === m.by || x.b.by === m.by));
        if (!c) { this.game.sync?.net?.send({ t: 'dwhirl', by: m.by, ph: 'end', res: 'none' }, true); return; } // (the clash was over: the guest gets its mana back — onNet 'none')
        const [mine, his] = c.a.by === m.by ? [c.a, c.b] : [c.b, c.a];
        if (whirlRefusal(mine.spell, his.spell, 1e9)) { this.game.sync?.net?.send({ t: 'dwhirl', by: m.by, ph: 'end', res: 'none' }, true); return; }
        this._takeOver(c, m.by, m.side || mine.side);
    }

    /** (the host) the clash is taken over: both beams leave the wands; everybody is told. */
    _takeOver(c, by, side) {
        const g = this.game, duel = g.duel;
        const [mine, his] = c.a.by === by ? [c.a, c.b] : [c.b, c.a];
        const marks = c.marks ? (c.a.by === by ? [c.marks[0], c.marks[1]] : [c.marks[1], c.marks[0]]) : [0xff4a8a, 0x4ab0ff];
        const info = { by, side, opp: his.by, spells: [mine.spell, his.spell], marks };
        duel._burst?.(c.a.front, 0xffffff, 36);
        duel.clashes = duel.clashes.filter((x) => x !== c);
        duel.bolts.delete(c.a.id); duel.bolts.delete(c.b.id);
        g.sync?.duelClashEnd?.(c.a.id, c.b.id, null);
        const w = duel._npcWizard?.(his.by); // (a tower's wizard whose beam was taken: dazed a moment)
        if (w && !w.dead) w.stunT = Math.max(w.stunT || 0, 2.5);
        g.sync?.net?.send({ t: 'dwhirl', ph: 'start', ...info }, true);
        this._begin(info);
    }

    _begin(info) {
        const g = this.game;
        const S = { ...info, S: newWhirl(), trail: [], trailT: 0, t: 0, ended: false };
        this.states.set(info.by, S);
        g.sound?.playThunder?.();
        if (info.by === g.localId) g.hud.setVoice('🌀 Оба луча в вашей палочке! Машите рукой по кругу — не останавливайтесь; потом наведите на соперника и замрите (или скажите «Attack»)', true);
        else if (info.opp === g.localId) g.hud.setVoice('🌀 Соперник забрал оба луча и крутит их вокруг себя — берегитесь!', true);
    }

    /** (everybody) the host / the caster tells: start / end. */
    onNet(m) {
        const g = this.game;
        if (m.ph === 'start') { if (!this.states.has(m.by)) this._begin({ by: m.by, side: m.side, opp: m.opp, spells: m.spells, marks: m.marks }); return; }
        if (m.ph === 'end') {
            if (m.res === 'none' && m.by === g.localId) { g.combat.fatigue = Math.min(g.combat.maxFatigue ?? 100, (g.combat.fatigue ?? 0) + WHIRL.COST); g.hud.setVoice('🌀 Дуэль уже закончилась — мана возвращена', true); return; }
            const S = this.states.get(m.by);
            if (S) { this._finish(S, m.res, true); }
        }
    }

    /** «Attack» (or any word): let go now if aimed. */
    attack(isFinal) {
        const S = this.mine;
        if (!S) return null;
        const aimed = this._aimed(S);
        const r = attackNow(S.S, aimed);
        if (r === 'release') { this._release(S); return 'Attack'; }
        if (isFinal) this.game.hud.setVoice(aimed ? '🌀 Сначала раскрутите вихрь — машите рукой' : '🌀 Наведите палочку на соперника', true);
        return 'Attack';
    }

    // ============================================================ every frame
    update(dt) {
        const g = this.game, duel = g.duel;
        if (this.pools) for (const p of this.pools) p.update(dt);
        for (const S of [...this.states.values()]) {
            S.t += dt;
            // the wand's place: mine live, another's by their hand
            const ok = this._wand(S, _o, _d);
            if (ok) {
                S.trailT -= dt;
                if (S.trailT <= 0) { S.trailT = WHIRL.TRAIL_DT; S.trail.push(_o.x, _o.y, _o.z); if (S.trail.length > WHIRL.TRAIL * 3) S.trail.splice(0, 3); }
                this._draw(S, dt);
            }
            if (S.by !== g.localId) { if (S.t > WHIRL.MAX_T + 3) this._finish(S, 'timeout', true); continue; } // (another's whirl: drawn; its end comes by the net, with a net-less safety)
            if (g.isDeadLocal || g.combat?.dead) { this._finish(S, 'dead'); continue; }
            const ch = g.character;
            const vel = ch.handVelocity?.[S.side];
            const speed = vel ? vel.length() : 0;
            const r = stepWhirl(S.S, dt, speed, this._aimed(S));
            if (r === 'release') this._release(S);
            else if (r) this._backfire(S, r);
        }
    }

    _wand(S, outPos, outDir) {
        const g = this.game;
        if (S.by === g.localId) { const a = castingHand(g); if (!a) return false; outPos.copy(a.origin); outDir.copy(a.dir).normalize(); return true; }
        const r = g.remotes?.get(S.by);
        if (!r) return false;
        const hp = r.handPose(S.side);
        outPos.copy(hp.origin); outDir.copy(hp.dir).normalize();
        return true;
    }

    /** The opponent's chest (a player / a tower's wizard); null — gone. */
    _oppPos(S, out) {
        const g = this.game;
        if (S.opp === g.localId) return out.copy(g.character.group.position).add(_v3.set(0, 1.4, 0));
        const r = g.remotes?.get(S.opp);
        if (r) return out.copy(r.position).add(_v3.set(0, 1.4, 0));
        const w = g.duel?._wizardPos?.(S.opp, out);
        return w || null;
    }

    _aimed(S) {
        const a = castingHand(this.game);
        if (!a) return false;
        const t = this._oppPos(S, _t);
        return !!t && aimedAt(a.origin, a.dir.clone().normalize(), t);
    }

    // ============================================================ the picture
    /** Two strands of the two spells' colours twist along the wand's trail, a white core between: the faster the hand, the wilder the twist. */
    _draw(S, dt) {
        const T = S.trail, n = T.length / 3;
        if (n < 3) return;
        const A = this._pool(0), B = this._pool(1), Cc = this._pool(2);
        const life = 0.07;
        const phase = S.t * 11;
        for (let i = 1; i < n; i++) {
            const k = i / n, amp = 0.15 + 0.55 * k * k;
            const p0 = _v.set(T[(i - 1) * 3], T[(i - 1) * 3 + 1], T[(i - 1) * 3 + 2]), p1 = _v2.set(T[i * 3], T[i * 3 + 1], T[i * 3 + 2]);
            const a = phase + i * 0.55;
            for (const [pool, sgn] of [[A, 1], [B, -1]]) {
                _d.set(Math.cos(a) * sgn, Math.sin(a) * sgn, Math.sin(a * 0.5) * 0.4).multiplyScalar(amp);
                const q0 = _t.copy(p0).add(_d);
                _d.set(Math.cos(a + 0.55) * sgn, Math.sin(a + 0.55) * sgn, Math.sin((a + 0.55) * 0.5) * 0.4).multiplyScalar(amp);
                const q1 = _o.copy(p1).add(_d);
                pool.add(q0, q1, life, 0.05 + 0.1 * k);
            }
            if (i % 2 === 0) Cc.add(p0, p1, life, 0.04 + 0.04 * k);
        }
    }

    // ============================================================ ends
    /** The beams go at him: two spells, one flight. */
    _release(S) {
        const g = this.game, duel = g.duel;
        const a = castingHand(g);
        const [sMine, sHis] = S.spells;
        if (a && this._oppPos(S, _t)) {
            const dir = a.dir.clone().normalize();
            const side = S.side;
            const b1 = duel.cast(sMine, null, side);
            const b2 = duel.cast(sHis, null, side);
            if (b2) b2.twin = true; // (the second spell flies with the first: it never clashes on its own — Duel._detectClashes)
            if (b1) b1.twin = true; // (and the first does not meet its own twin; the opponent's answer meets a lone one)
            g.hud.setVoice('🌀 Два заклинания одним лучом — в соперника!', true);
        }
        this._finish(S, 'release');
    }

    /** The beams fall back on the whirler: both spells hit him (as the loser of a clash: whatever he wears). */
    _backfire(S, why) {
        const g = this.game, duel = g.duel;
        const [sMine, sHis] = S.spells;
        const text = why === 'timeout' ? 'Вы не удержали вихрь — десять секунд прошло' : why === 'idle' ? 'Вы не начали махать' : 'Вы остановились не на соперника';
        g.hud.setVoice(`🌀 ${text}: оба заклинания врезались в вас!`, true);
        duel._burst?.(g.character.group.position, 0xffffff, 40);
        duel.applyToMe(sHis, S.opp, S.side, { clash: true });
        duel.applyToMe(sMine, g.localId, S.side, { clash: true });
        this._finish(S, 'backfire');
    }

    /** `fromNet`: another computer ended it — only the picture goes. */
    _finish(S, res, fromNet = false) {
        if (S.ended) return;
        S.ended = true;
        this.states.delete(S.by);
        if (!fromNet && S.by === this.game.localId) this.game.sync?.net?.send({ t: 'dwhirl', by: S.by, ph: 'end', res }, true);
        const g = this.game;
        const p = S.trail.length >= 3 ? _v.set(S.trail[S.trail.length - 3], S.trail[S.trail.length - 2], S.trail[S.trail.length - 1]) : g.character.group.position;
        g.duel?._burst?.(p, 0xffffff, 24);
    }

    /** «Стоп»: I give the whirl up — the beams fall back on me (backfire). */
    stopMine() {
        const S = this.mine;
        if (!S) return false;
        this._backfire(S, 'stop');
        return true;
    }

    dispose() { this.states.clear(); }
}
