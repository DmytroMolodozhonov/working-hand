/**
 * MusicDirector.js — what music plays when (the author 05.11): the road's ten when the hero is out in the land, the towns' five in a castle,
 * a village or a hamlet, the magic five in the tower and the wizards' towns, the caves' five underground, hell's five in hell; a fight — the
 * battle music, crossfaded in («если игрок вступит в бой, то он будет плавно переходить в музыку боя») and up the ten as the fight grows
 * (a few zombies — a skirmish; knights, a castle against you, a duel — fiercer; a boss — the boss's). The old music (the mp3 files) is off.
 *
 * Not in the way: the calm tunes play once each, softly, and between them a quiet while (GAP); the battle tune loops while the fight lasts,
 * and only after it has been over for a while (CALM_AFTER) the land's music comes back. Space is quiet (SoundManager.spaceQuiet).
 * Every tune is made in a worker (music.worker.js, MusicComposer.renderTune) — never in a frame; the next one is made while one plays; at
 * most CACHE tunes are kept (nothing piles up). The volume is the «музыка» slider (SoundManager.music.volume).
 *
 * `musicPlace(g)` (pure but for reading the game) → {cat, intensity}; the class plays it on a SoundManager.
 */
import { tunesOf, tuneById, battleTune } from './MusicCatalog.js';

export const MUSIC = {
    SR: 32000, // the tunes' sample rate (synthesised: enough; a third less memory than 48 kHz)
    CACHE: 3, // tunes kept made (the current, the next, a battle one)
    FADE_IN: 4, FADE_OUT: 5, // s: a calm change
    TO_BATTLE: 2.2, // s: into a fight
    UP_BATTLE: 2.5, // s: a fiercer fight — the fiercer tune
    CALM_AFTER: 9, // s with no fight before the land's music comes back
    SETTLE: 3, // s a new place must last before its music (no flicker at a border)
    GAP: { adventure: [18, 45], town: [10, 25], magic: [12, 30], cave: [8, 20], hell: [4, 10] },
    UP_STEP: 0.15, // the fight's intensity must grow this much over the tune's to change it (never down while it lasts)
    UP_EVERY: 8, // s at least between two battle tunes
};

/**
 * Where the hero is for the music: battle (with its intensity 0…1), hell, cave, magic, town or adventure; null — no music (space, the menu).
 */
export function musicPlace(g) {
    const p = g?.character?.group?.position;
    if (!p) return null;
    if (g.space?.realm && g.space.realm !== 'earth') return null; // (space is quiet)
    if (g.school && g.school.phase !== 'free') return { cat: g.school.phase === 'ride' || g.school.phase === 'intro' ? 'schoolEpic' : 'school' }; // («Акселдорф»: the opening's grand theme, then the calm one of the tour — MusicCatalog)
    if (g.inFight?.() || g.castleLife?.saviorNear?.(p, 160)) return { cat: 'battle', intensity: fightIntensity(g) };
    if (g.hellGate?.inHell) return { cat: 'hell' };
    if (g._inCave) return { cat: 'cave' };
    const t = g.terrain?.data, x = Math.round(p.x), z = Math.round(p.z);
    if (t) {
        if (t.towers?.landAt?.(x, z) || t.villages?.landAt?.(x, z) || g.school) return { cat: 'magic' }; // (the school's days: the wizards' calm tunes)
        if (t.castles?.landAt?.(x, z) || t.hamlets?.landAt?.(x, z)) return { cat: 'town' };
    }
    return { cat: 'adventure' };
}

/** How fierce the fight is (0…1): zombies about — a skirmish; knights / a castle / a ship against me — more; a duel — more; a boss — the most. */
export function fightIntensity(g) {
    const p = g.character.group.position, me = g.localId;
    let k = 0.15;
    let foes = 0;
    for (const z of g.zombies || []) if (!z.isDead && !z.dummy && z.group.position.distanceTo(p) < 25) foes++;
    for (const cs of g.castleLife?.castles?.values?.() || []) {
        if (cs.hostile?.get?.(me) > Date.now()) k = Math.max(k, 0.5);
        for (const v of cs.active?.values?.() || []) if (!v.dead && v.foe === me && Math.hypot(v.x - p.x, v.z - p.z) < 40) foes += v.role === 'knight' ? 2 : 1;
    }
    k = Math.max(k, Math.min(0.6, 0.15 + foes * 0.05));
    if (g.duel?._inDuel?.() || g.duel?.underFire?.() || g.arenaDuels?.meFighting?.()) k = Math.max(k, 0.6);
    for (const s of g.ships?.awake || []) if (s.hostile?.get?.(me) > performance.now()) k = Math.max(k, 0.65);
    // the bosses (and the great beasts) at me
    const near = (q, r) => q && Math.hypot(q.x - p.x, q.z - p.z) < r;
    for (const d of g.dragons?.list || []) if (!d.dead && !d.form && d.target && near(d.model.position, 140)) k = Math.max(k, 0.9);
    if (g.iceQueen?.active || g.iceCastle?.queen?.fighting) k = Math.max(k, 1);
    if (g.spiders?.list?.some?.((s) => !s.dead && s.angry && near(s.group?.position, 80))) k = Math.max(k, 0.85);
    if (g.diabolos?.awake || g.diabolos?.fighting) k = Math.max(k, 1);
    for (const v of g.castleLife?.byId?.values?.() || []) if (v.savior != null && !v.dead && near({ x: v.x, z: v.z }, 160)) { k = 1; break; } // (the white Saviour is on the hunt: the boss's battle music)
    return Math.min(1, k);
}

export class MusicDirector {
    /** sound: the SoundManager (its context, its music bus and volume). */
    constructor(sound) {
        this.sound = sound;
        this.on = false; // (started with the game: the menu is quiet)
        this.cache = new Map(); // id → AudioBuffer (made)
        this.order = []; // (the cache's age)
        this.pending = new Map(); // id → true while a worker makes it
        this.cur = null; // {id, cat, src, gain, ends, intensity}
        this.want = null; // the place now {cat, intensity}
        this.settled = null; this.settleT = 0;
        this.gapT = 0; // s of quiet left before the next calm tune
        this.calmT = 0; // s since the fight was last seen
        this.lastUp = -1e9; this.t = 0;
        this.next = {}; // cat → index of the next tune
        this._worker = null;
    }

    start() { this.on = true; }
    stop() { this.on = false; this._fadeOut(1); }

    /** Every frame (Game.update): the place → the music. `place`: musicPlace(g). */
    update(dt, place) {
        if (!this.on || !this.sound?.context) return;
        this.t += dt;
        const ctx = this.sound.context;
        if (this.cur?.ends && ctx.currentTime >= this.cur.ends) { this.cur = null; this.gapT = this._gap(this.settled?.cat); } // (a calm tune played to its end)
        if (!place) { if (this.cur) this._fadeOut(MUSIC.FADE_OUT); this.settled = null; return; }
        // the battle: at once in; out only after a quiet while
        if (place.cat === 'battle') {
            this.calmT = 0;
            this.settled = place;
            const c = this.cur;
            if (!c || c.cat !== 'battle') { this._play(battleTune(place.intensity).id, MUSIC.TO_BATTLE); return; }
            if (place.intensity > c.intensity + MUSIC.UP_STEP && this.t - this.lastUp > MUSIC.UP_EVERY) {
                const tune = battleTune(place.intensity);
                if (tune.id !== c.id) { this.lastUp = this.t; this._play(tune.id, MUSIC.UP_BATTLE); }
            }
            return;
        }
        if (this.cur?.cat === 'battle' && (this.calmT += dt) < MUSIC.CALM_AFTER) return;
        // a calm place: it must last SETTLE s (a border crossed back and forth plays nothing new)
        if (!this.settled || this.settled.cat !== place.cat) {
            if (this.want?.cat !== place.cat) { this.want = place; this.settleT = 0; }
            if ((this.settleT += dt) < MUSIC.SETTLE && this.settled && this.cur?.cat !== 'battle') return;
            this.settled = place;
            if (this.cur) { this._fadeOut(MUSIC.FADE_OUT); this.gapT = 2; } // (the old one goes; the new one after a breath)
            else this.gapT = Math.min(this.gapT, 2);
        }
        if (this.cur) { this._prefetchNext(place.cat); return; }
        if ((this.gapT -= dt) > 0) { this._prefetchNext(place.cat); return; }
        this._play(this._pick(place.cat), MUSIC.FADE_IN);
    }

    _gap(cat) { const g = MUSIC.GAP[cat] || [10, 25]; return g[0] + Math.random() * (g[1] - g[0]); }

    /** The next tune of a kind (round and round, from a random one first). */
    _pick(cat) {
        const list = tunesOf(cat);
        if (this.next[cat] == null) this.next[cat] = Math.floor(Math.random() * list.length);
        return list[this.next[cat] % list.length].id;
    }

    _prefetchNext(cat) {
        const list = tunesOf(cat);
        if (!list.length) return;
        if (this.next[cat] == null) this.next[cat] = Math.floor(Math.random() * list.length);
        this._make(list[this.next[cat] % list.length].id);
    }

    /** Play tune `id` with a crossfade of `fade` s (made first if not yet: it starts when ready, if still wanted). */
    _play(id, fade) {
        const buf = this.cache.get(id);
        const tune = tuneById(id);
        if (!buf) { this._make(id, () => { const p = this.settled; if (this.on && p && (p.cat === tune.cat)) this._play(id, fade); }); return; }
        this._touch(id);
        if (this.cur?.id === id) return;
        const ctx = this.sound.context, node = this.sound.musicSource?.(buf, tune.loop); // (the source is SoundManager's: on the music bus, under the slider)
        if (!node) return;
        this._fadeOut(fade);
        const { src, gain } = node;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fade);
        src.start();
        this.cur = { id, cat: tune.cat, src, gain, intensity: tune.intensity ?? 0, ends: tune.loop ? 0 : ctx.currentTime + buf.duration };
        if (tune.cat !== 'battle') this.next[tune.cat] = ((this.next[tune.cat] ?? 0) + 1) % tunesOf(tune.cat).length;
        this.sound.game?.perf?.note?.(`музыка: «${tune.ru}» (${tune.cat})`);
        // (made ahead: the next of this kind, and a battle tune for a sudden fight)
        if (tune.cat !== 'battle') { this._prefetchNext(tune.cat); this._make(battleTune(0.2).id); }
    }

    _fadeOut(s) {
        const c = this.cur;
        if (!c) return;
        const ctx = this.sound.context, t = ctx.currentTime;
        try {
            c.gain.gain.cancelScheduledValues(t);
            c.gain.gain.setValueAtTime(c.gain.gain.value, t);
            c.gain.gain.linearRampToValueAtTime(0, t + s);
            c.src.stop(t + s + 0.05);
        } catch { /* already stopped */ }
        this.cur = null;
    }

    _touch(id) { const i = this.order.indexOf(id); if (i >= 0) this.order.splice(i, 1); this.order.push(id); }

    /** Have tune `id` made (in a worker); `then` when it is. The cache keeps CACHE (the oldest not playing goes). */
    _make(id, then) {
        if (this.cache.has(id)) { then?.(); return; }
        if (this.pending.has(id)) { if (then) this.pending.get(id).push(then); return; }
        const ctx = this.sound.context;
        this.pending.set(id, then ? [then] : []);
        const done = (left, right) => {
            const cbs = this.pending.get(id) || [];
            this.pending.delete(id);
            if (!left) return;
            const buf = ctx.createBuffer(2, left.length, MUSIC.SR);
            buf.copyToChannel(left, 0); buf.copyToChannel(right, 1);
            this.cache.set(id, buf); this._touch(id);
            while (this.cache.size > MUSIC.CACHE) { const old = this.order.find((k) => k !== this.cur?.id && k !== id); if (!old) break; this.cache.delete(old); this.order.splice(this.order.indexOf(old), 1); }
            for (const f of cbs) f();
        };
        try {
            if (!this._worker) {
                this._worker = new Worker(new URL('./music.worker.js', import.meta.url), { type: 'module' });
                this._worker.onmessage = (e) => { const m = e.data || {}; this._done?.get(m.id)?.(m.left, m.right); this._done?.delete(m.id); };
                this._worker.onerror = () => { for (const [k, f] of this._done || []) f(null); this._done?.clear(); };
            }
            (this._done || (this._done = new Map())).set(id, done);
            this._worker.postMessage({ id, sr: MUSIC.SR });
        } catch { done(null); }
    }

    dispose() { this._fadeOut(0.2); this._worker?.terminate(); this._worker = null; this.cache.clear(); }
}
