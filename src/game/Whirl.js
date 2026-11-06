/**
 * Whirl.js — «Spiralis» («Спиралис»): the beam clash taken over and whirled (the rules and the author's words: WhirlRules.js).
 *
 *   word (in my clash)   → 500 mana; the host takes the clash over (a guest asks it: 'dwhirlreq'): both beams are taken off the wands, both spells are kept; everybody draws the whirl (`dwhirl start`)
 *   the swing            → my computer watches the wand hand: it must go on (WhirlRules.stepWhirl); the ribbon of both colours whirls along the wand's trail
 *   release / backfire   → aimed at him and still: ONE charge of mine carrying his spell too leaves my wand (Duel.cast `extra`: both hit together; in a clash it pushes ×DOUBLE_K and if it wins both reach him);
 *                          his new spell flying at me while the whirl is on: aim at him — it is let go at once against his (a new duel; no word needed);
 *                          anything else: both spells hit me (applyToMe, as a lost clash: no armour or robe turns them away). Everybody is told (`dwhirl end`).
 *
 * «А если»: I die / leave / my hand is lost in a whirl — it ends as a backfire's nothing (no spells on a dead hero); the opponent dies / leaves meanwhile — the beams have nobody to go at: let go into the air, nothing
 * hits; a guest's word reaches the host late and the clash is over — nothing is taken, the mana is given back; two whirls in one clash — the host takes only the first; «Дай» — refused with the reason; a hand off the
 * opponent when taken over — the clash is as it is: taken the same; Creative's endless mana — no price; a whirl with no clash left (a clash ended a moment earlier) — «нет дуэли».
 */
import * as THREE from 'three';
import { SegmentPool } from '../fx/Particles.js';
import { castingHand } from './WandAim.js';
import { WHIRL, newWhirl, stepWhirl, attackNow, aimedAt, whirlRefusal, bewilderFor, BEWILDER_LINES } from './WhirlRules.js';
import { reactLevel } from './WizardMind.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();

export class Whirl {
    constructor(game) {
        this.game = game;
        this.states = new Map(); // casterId → {by, side, opp, oppKind, spells: [mine, his], marks: [hexA, hexB], S, trail: [], trailT, t, ...}
        this.pools = null;
        this.dazed = []; // [{id, t}] the tower's wizards that lost their heads: their `bewilderT` counts down
        this._sayAt = -1e9;
    }

    /** My whirl (null: none). */
    get mine() { return this.states.get(this.game.localId) || null; }

    /** One additive segment pool per colour (a few: the two spells' colours and the mix of them), kept. */
    _pool(hex) {
        if (!this.pools) this.pools = new Map();
        let p = this.pools.get(hex);
        if (!p) { p = new SegmentPool(this.game.scene, { capacity: 160, radius: 0.13, color: hex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }); this.pools.set(hex, p); }
        return p;
    }

    sampleMeshes() { this._pool(0xff4a8a); return []; }

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
        const m0 = c.a.front, info = { by, side, opp: his.by, hs: his.side, spells: [mine.spell, his.spell], marks, m0: [Math.round(m0.x * 100) / 100, Math.round(m0.y * 100) / 100, Math.round(m0.z * 100) / 100] };
        duel._burst?.(c.a.front, 0xffffff, 36);
        duel.clashes = duel.clashes.filter((x) => x !== c);
        duel.bolts.delete(c.a.id); duel.bolts.delete(c.b.id);
        g.sync?.duelClashEnd?.(c.a.id, c.b.id, null);
        // (a wizard whose beam was taken: a weak or a middle one loses his head for some seconds — the face twists, the wand goes down, no spells; a strong one may get it at once; the head of the tower never — WhirlRules.bewilderFor)
        const w = duel._npcWizard?.(his.by);
        const bw = w && !w.dead ? bewilderFor(reactLevel(w.rank)) : 0;
        if (w && !w.dead) {
            const pick = (a) => a[Math.floor(Math.random() * a.length)];
            if (bw > 0) { w.stunT = Math.max(w.stunT || 0, bw); g.castleLife?._say?.(w, pick(BEWILDER_LINES.lost), 3); }
            else if (reactLevel(w.rank) >= 3) g.castleLife?._say?.(w, pick(BEWILDER_LINES.knows), 3);
        }
        info.bw = Math.round(bw * 10) / 10;
        g.sync?.net?.send({ t: 'dwhirl', ph: 'start', ...info }, true);
        this._begin(info);
    }

    _begin(info) {
        const g = this.game;
        const duel = g.duel;
        const col = (spell, by) => (duel?.colors && spell ? duel.colors(spell, by).glow : 0xffffff);
        const cA = col(info.spells[0], info.by), cB = col(info.spells[1], info.opp);
        const mix = new THREE.Color(cA).lerp(new THREE.Color(cB), 0.5).getHex();
        const S = { ...info, S: newWhirl(), trail: [], trailT: 0, t: 0, ended: false, cols: [cA, cB, mix] };
        this.states.set(info.by, S);
        if (info.bw > 0) { const w = duel?._npcWizard?.(info.opp); if (w) { w.bewilderT = info.bw; this.dazed.push({ id: info.opp, t: info.bw }); } } // (every computer shows the lost face: it counts down here)
        g.sound?.playThunder?.();
        if (info.by === g.localId) g.hud.setVoice('🌀 Оба луча стекаются в вашу палочку! Машите рукой по кругу — не останавливайтесь; потом наведите на соперника и замрите (или скажите «Attack»)', true);
        else if (info.opp === g.localId) g.hud.setVoice('🌀 Соперник забрал оба луча и крутит их вокруг себя — берегитесь!', true);
    }

    /** (everybody) the host / the caster tells: start / end. */
    onNet(m) {
        const g = this.game;
        if (m.ph === 'start') { if (!this.states.has(m.by)) this._begin({ by: m.by, side: m.side, opp: m.opp, hs: m.hs, spells: m.spells, marks: m.marks, m0: m.m0, bw: m.bw }); return; }
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
        if (this.pools) for (const p of this.pools.values()) p.update(dt);
        for (let i = this.dazed.length - 1; i >= 0; i--) { const d = this.dazed[i], w = duel?._npcWizard?.(d.id); d.t -= dt; if (w) w.bewilderT = Math.max(0, d.t); if (d.t <= 0 || !w) { if (w) w.bewilderT = 0; this.dazed.splice(i, 1); } }
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
            const aimed = this._aimed(S);
            // the opponent answers with a new spell at once: my bundle is already in the wand — aim it at him (no word needed) and it goes against his: a new duel
            if (aimed && S.S.started && S.t > WHIRL.MORPH_T && this._incoming(S)) { this._release(S, true); continue; }
            const r = stepWhirl(S.S, dt, speed, aimed);
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

    /** The opponent's charge is flying at me now. */
    _incoming(S) {
        const duel = this.game.duel;
        for (const b of duel.bolts.values()) if (b.by === S.opp && b.state === 'flying' && b.tk === 'p' && b.tid === this.game.localId) return true;
        return false;
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
    /**
     * The two beams of the clash do not vanish: for MORPH_T s they go on as they were (each its own colour) while the meeting point slides to my wand and his beam's tail leaves his wand and runs
     * after it — both collapse into my wand, and the whirl grows out of that place (the ribbon's twist rises from nothing). The two colours run together slowly (BLEND_T), never to white.
     */
    _draw(S, dt) {
        const g = this.game, duel = g.duel;
        const T = S.trail, n = T.length / 3;
        const k = Math.min(1, S.t / WHIRL.MORPH_T), e = k * k * (3 - 2 * k);
        // (1) the clash's beams flowing in
        if (k < 1 && S.m0) {
            const hA = _o, hB = _t, dd = _d;
            if (duel._handOf(S.by, S.side, hA, dd) && duel._handOf(S.opp, S.hs || 'right', hB, dd)) {
                const m = _v.set(S.m0[0], S.m0[1], S.m0[2]).lerp(hA, e);
                const tail = _v2.copy(hB).lerp(m, e);
                duel._drawBolt(S.spells[0], hA, m, S.by, duel._markPool(S.marks[0]));
                duel._drawBolt(S.spells[1], tail, m, S.opp, duel._markPool(S.marks[1]));
            }
        }
        if (n < 3) return;
        // (2) the whirl's ribbon: grows out of the wand as the beams arrive; the colours blend slowly
        const ramp = Math.max(0, Math.min(1, (S.t - WHIRL.MORPH_T * 0.35) / (WHIRL.MORPH_T * 0.9)));
        if (ramp <= 0) return;
        const bl = Math.max(0, Math.min(1, (S.t - WHIRL.MORPH_T) / WHIRL.BLEND_T));
        const blend = bl * bl * (3 - 2 * bl);
        const pA = this._pool(S.cols[0]), pB = this._pool(S.cols[1]), pM = this._pool(S.cols[2]);
        const life = 0.07, phase = S.t * 11;
        for (let i = 1; i < n; i++) {
            const kk = i / n, amp = (0.1 + 0.6 * kk * kk) * ramp;
            const p0 = _v.set(T[(i - 1) * 3], T[(i - 1) * 3 + 1], T[(i - 1) * 3 + 2]), p1 = _v2.set(T[i * 3], T[i * 3 + 1], T[i * 3 + 2]);
            const a = phase + i * 0.55, r0 = (0.05 + 0.1 * kk) * ramp;
            for (const [pool, sgn] of [[pA, 1], [pB, -1]]) {
                _d.set(Math.cos(a) * sgn, Math.sin(a) * sgn, Math.sin(a * 0.5) * 0.4).multiplyScalar(amp);
                const q0 = _t.copy(p0).add(_d);
                _d.set(Math.cos(a + 0.55) * sgn, Math.sin(a + 0.55) * sgn, Math.sin((a + 0.55) * 0.5) * 0.4).multiplyScalar(amp);
                const q1 = _o.copy(p1).add(_d);
                pool.add(q0, q1, life, Math.max(0.01, r0 * (1 - 0.85 * blend)));
                if (blend > 0.02) pM.add(q0, q1, life, r0 * blend * 0.9); // (the colours running together)
            }
        }
    }

    // ============================================================ ends
    /**
     * The beams go at him: ONE charge of my spell that carries his spell too (`extra`) — both hit together; it can meet his answer in a clash (then it pushes harder, and if it wins both reach him).
     * `counter`: let go at once at his new charge (no word, no still hand — the bundle was already on the wand).
     */
    _release(S, counter = false) {
        const g = this.game, duel = g.duel;
        const [sMine, sHis] = S.spells;
        if (this._oppPos(S, _t) && castingHand(g)) {
            duel.cast(sMine, null, S.side, null, sHis);
            g.hud.setVoice(counter ? '🌀 Два заклинания одним лучом — навстречу его новому!' : '🌀 Два заклинания одним лучом — в соперника!', true);
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
