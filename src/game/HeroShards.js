/**
 * HeroShards.js — the water mage's ICE SHARDS mode of «Water Vortex» (the author 15.11: «если у мага воды уже есть заклинание Water Vortex, то он может щёлкнуть двумя руками
 * (кистями) без слов — и они превратятся в осколки; альтернативно слово сказать как режим — осколки, только на английском»).
 *
 *   Only a mage of WATER (HeroElement) with his Water Vortex going (`g.vortex.state`, enough water in it). Then:
 *     the clap  both hands brought together fast (they were apart, now touching) — no words;  or the word «Shards».
 *     the water of the vortex turns to ice: the stream stops, a ring of ice shards (one per ~2 m³, 4…16) hangs and turns round him (IceShards draws it),
 *     the volley  hold the wand hand still on a target for half a second (or say «Атак»): the shards fly one after another (0.07 s apart) as duel charges
 *                 (`ShardDuel`: thin, fast, icy, 3.5 each) at what he points at — every kind of body is hit as by any duel spell, a shield turns a shard.
 *     they hang `LIFE` s at most (1 mana a second, half for a water mage); «стоп», death, a stun, no mana — they fall as a spray of ice.
 *
 * «А если»: no vortex / too little water (a hint); not a water mage (a hint — the clap does nothing); both hands busy holding things (the clap needs the hands free of
 * things: a thing in a hand is not clapped); a clap by accident while swinging the vortex (only when the vortex has ≥ MIN_VOLUME and the hands came from ≥ FAR apart);
 * a second «Shards» while they hang (nothing, no second price); death / a loaded save (nothing is saved: they were a moment's magic); the network (the shards are duel
 * charges — every computer already draws and decides them; the orbiting ring is drawn locally for the others from the hero's `fx` flag in a later step).
 */
import * as THREE from 'three';
import { SPELL_COST } from './SpellCosts.js';
import { elementK } from './HeroElement.js';

export const HERO_SHARDS = {
    MIN_VOLUME: 6, // m³ of vortex water for a ring of shards
    PER_VOLUME: 0.5, // shards a cubic metre
    MIN_N: 4, MAX_N: 16,
    CLAP: { NEAR: 0.3, FAR: 0.7, WIN: 0.5, COOL: 1.2 }, // m / s: hands within NEAR now, were ≥ FAR apart within the last WIN seconds
    LIFE: 25, DRAIN: 1, // s the ring hangs, mana a second
    AIM_HOLD: 0.5, AIM_TOL: 0.06, // s / rad the wand hand must stay on its aim to loose them
    STAGGER: 0.07, // s between shards
};
export const shardCount = (volume) => Math.max(HERO_SHARDS.MIN_N, Math.min(HERO_SHARDS.MAX_N, Math.round(volume * HERO_SHARDS.PER_VOLUME)));
/** PURE: did the hands clap? `hist` = [{t, d}] (distance between the hands, seconds) newest last. */
export function clapped(hist, C = HERO_SHARDS.CLAP) {
    if (!hist || hist.length < 3) return false;
    const last = hist[hist.length - 1];
    if (last.d > C.NEAR) return false;
    let far = false;
    for (const h of hist) if (last.t - h.t <= C.WIN && h.d >= C.FAR) { far = true; break; }
    return far;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

export class HeroShards {
    constructor(game) {
        this.game = game; this.on = false; this.n = 0; this.t = 0; this.hist = []; this.cool = 0; this.aimT = 0; this.queue = []; this.lastDir = new THREE.Vector3(); this._ot = 0;
    }
    get active() { return this.on; }

    /** The water mage with a vortex that holds enough water? */
    canMake() {
        const g = this.game;
        return g.heroElement?.id === 'water' && !!g.vortex?.state && (g.vortex.state.volume || 0) >= HERO_SHARDS.MIN_VOLUME && !this.on;
    }

    /** The word «Shards». */
    say(isFinal = true) {
        const g = this.game;
        if (!isFinal) return null;
        if (this.on) return null;
        if (g.heroElement?.id !== 'water') { g.hud?.setVoice?.('🧊 Осколки получаются только у мага воды: нужна пентаграмма воды', true); return null; }
        if (!g.vortex?.state) { g.hud?.setVoice?.('🧊 Сначала вызовите «Water Vortex» и закрутите воду', true); return null; }
        if ((g.vortex.state.volume || 0) < HERO_SHARDS.MIN_VOLUME) { g.hud?.setVoice?.('🧊 Воды в вихре мало — покрутите рукой ещё', true); return null; }
        return this.make() ? 'IceShards' : null;
    }

    /** The vortex's water becomes ice shards. */
    make() {
        const g = this.game, ch = g.character, c = g.combat;
        const tired = c?.check?.('IceShards'); if (tired) { g.hud?.setVoice?.(tired, true); return false; }
        const n = shardCount(g.vortex.state.volume || 0);
        c?.pay?.('IceShards');
        g.vortex.stop(false); // (the stream ends: the ice is made of it)
        this.on = true; this.n = n; this.t = 0; this.aimT = 0; this.queue.length = 0; this._ot = 0;
        const p = ch.group.position;
        g.fx?.lightFlash?.(_a.set(p.x, p.y + 1, p.z), 0xbfe9ff, 4, 0.4, 25);
        for (let i = 0; i < 30; i++) g.fx?.spark?.(_a.set(p.x + (Math.random() - 0.5) * 3, p.y + 1 + Math.random() * 2.2, p.z + (Math.random() - 0.5) * 3), i % 2 ? 0xe8f6ff : 0x9fd8ff, 0.14, _b.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.8);
        g.sound?.playIce?.();
        g.hud?.setVoice?.(`🧊 Вода стала льдом: ${n} осколков кружат вокруг вас. Наведите руку на цель и держите — они полетят. «Стоп» — рассыпать`, true);
        return true;
    }

    /** The volley: all the shards, one after another, at where the hand points. */
    fire() {
        const g = this.game;
        if (!this.on || this.queue.length) return false;
        for (let i = 0; i < this.n; i++) this.queue.push(i * HERO_SHARDS.STAGGER);
        this.n = 0; this.firing = true;
        g.hud?.setVoice?.('🧊 Осколки!', true);
        return true;
    }

    stop(why = 'stop') {
        if (!this.on) return false;
        const g = this.game, p = g.character.group.position;
        this.on = false; this.n = 0; this.queue.length = 0; this.firing = false;
        for (let i = 0; i < 18; i++) g.fx?.spark?.(_a.set(p.x + (Math.random() - 0.5) * 3, p.y + 2.4, p.z + (Math.random() - 0.5) * 3), 0xcfeeff, 0.12, _b.set((Math.random() - 0.5) * 2, -1 - Math.random() * 3, (Math.random() - 0.5) * 2), 0.7);
        if (why === 'mana') g.hud?.setVoice?.('🧊 Мана кончилась — осколки рассыпались', true);
        return true;
    }

    /** Every frame. */
    update(dt) {
        const g = this.game, ch = g.character, c = g.combat;
        this.cool = Math.max(0, this.cool - dt);
        const dead = c?.dead || g.isDeadLocal || c?.stunned || c?.frozen;
        if (this.on && dead) { this.stop('down'); return; }
        // the clap: both hands tracked, free of things, a vortex with water — and a water mage
        if (!this.on && g.heroElement?.id === 'water' && g.vortex?.state) {
            const free = !g.items?.held?.left && !g.items?.held?.right;
            if (free || g.items?.held && !g.items.held.left?.item && !g.items.held.right?.item) {
                const L = ch.getHandWorldPosition('left', _a), R = ch.getHandWorldPosition('right', _b);
                const t = performance.now() / 1000, d = L.distanceTo(R);
                this.hist.push({ t, d }); while (this.hist.length > 40 || (this.hist.length && t - this.hist[0].t > 1)) this.hist.shift();
                if (this.cool <= 0 && ch.isHandTracked?.('left') !== false && ch.isHandTracked?.('right') !== false && this.canMake() && clapped(this.hist)) { this.cool = HERO_SHARDS.CLAP.COOL; this.hist.length = 0; this.make(); }
            }
        } else this.hist.length = 0;
        if (!this.on) return;
        this.t += dt; this._ot += dt;
        if (c && (c.drain(HERO_SHARDS.DRAIN * (g.heroElement?.k?.('IceShards') ?? 1) * dt, dt) === false || c.manaOut?.())) { this.stop('mana'); return; }
        if (this.t > HERO_SHARDS.LIFE && !this.queue.length) { this.stop('time'); return; }
        // aim and hold: the wand hand still on a target looses them
        const side = g.wandSide?.() || g.magicHand || 'right';
        const dir = ch.getPointingDirection ? ch.getPointingDirection(side, _d) : ch.getHandDirection(side, _d);
        if (!this.queue.length && this.n > 0) {
            if (this.lastDir.angleTo(dir) < HERO_SHARDS.AIM_TOL && g.duel?.pickSide && g.duel.pickSide(false, g._duelReach?.() || 20)) this.aimT += dt; else this.aimT = 0;
            this.lastDir.copy(dir);
            if (this.aimT >= HERO_SHARDS.AIM_HOLD) { this.aimT = 0; this.fire(); }
        }
        // the volley: one shard per tick of the queue, as duel charges at the target under the hand
        if (this.queue.length) {
            for (let i = this.queue.length - 1; i >= 0; i--) { this.queue[i] -= dt; if (this.queue[i] <= 0) { this.queue.splice(i, 1); this._shoot(); } }
            if (!this.queue.length) { this.firing = false; this.stop('done'); }
        }
    }

    _shoot() {
        const g = this.game, reach = g._duelReach?.() || 20;
        const target = g.duel?.pickSide?.(false, reach);
        const side = g.wandSide?.() || g.magicHand || 'right';
        try { g.duel?.cast('ShardDuel', target, side, reach); } catch (e) { console.warn('shard', e); }
    }
}
