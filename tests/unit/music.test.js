// The game's own music (the author 05.11): forty tunes — 10 of the road, 10 of battle (from a skirmish to a boss), 5 caves, 5 hell, 5 towns,
// 5 magic towns (MusicCatalog.js), composed and played by the game (MusicComposer.js), what plays when (MusicDirector.js): the place,
// a fight crossfaded in and up as it grows, back to calm only after a quiet while; the old mp3 music is not loaded.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUNES, tunesOf, battleTune, tuneById } from '../../src/audio/MusicCatalog.js';
import { compose, renderTune, degreeNote, MODES } from '../../src/audio/MusicComposer.js';
import { MusicDirector, musicPlace, MUSIC } from '../../src/audio/MusicDirector.js';

// (42: the author 07.11 asked the school «Акселдорф» for music of its own — a grand theme for the opening ('schoolEpic') and a calm one
// for the tour and the speech ('school'))
test('forty-two tunes: 10 road, 10 battle, 5 caves, 5 hell, 5 towns, 5 magic, the school\'s two — each its own', () => {
    const n = (c) => tunesOf(c).length;
    assert.deepEqual([n('adventure'), n('battle'), n('cave'), n('hell'), n('town'), n('magic'), n('schoolEpic'), n('school')], [10, 10, 5, 5, 5, 5, 1, 1]);
    assert.equal(TUNES.length, 42);
    assert.equal(new Set(TUNES.map((t) => t.id)).size, 42);
    assert.equal(new Set(TUNES.map((t) => t.seed)).size, 42);
    assert.equal(new Set(TUNES.map((t) => t.ru)).size, 42, 'each its own name');
    for (const t of TUNES) assert.ok(MODES[t.mode], t.id);
    // the battle ones: from a skirmish to a boss, looping
    const b = tunesOf('battle');
    for (let i = 1; i < b.length; i++) assert.ok(b[i].intensity > b[i - 1].intensity && b[i].tempo >= b[i - 1].tempo, b[i].id);
    assert.ok(b.every((t) => t.loop));
    assert.equal(battleTune(0).id, 'battle1');
    assert.equal(battleTune(1).id, 'battle10');
});

test('a tune is written, not random notes: the same every time; the melody ends its phrases on the tonic; in the key', () => {
    const t = tuneById('road1');
    const a = compose(t), b = compose(t);
    assert.deepEqual(a.events.slice(0, 50), b.events.slice(0, 50), 'the same tune from its seed');
    const mel = a.events.filter((e) => e.inst === t.melody);
    assert.ok(mel.length > 40, 'a melody');
    const scale = new Set(MODES[t.mode].map((s) => (t.key + s) % 12));
    assert.ok(mel.every((e) => scale.has(((e.midi % 12) + 12) % 12)), 'every melody note in the key');
    const long = mel.filter((e) => e.dur >= 3);
    assert.ok(long.some((e) => (e.midi - t.key) % 12 === 0), 'phrases come home to the tonic');
    assert.ok(a.events.some((e) => e.inst === t.pad) && a.events.some((e) => e.inst === 'bass') && a.events.some((e) => e.inst === t.arp));
    assert.equal(degreeNote(60, 'major', 7), 72);
});

test('rendered: no NaN, never clipping, the road softer than the battle; caves quiet', () => {
    const short = (id) => { const t = tuneById(id); return renderTune({ ...t, form: t.cat === 'battle' ? 'A' : 'IA' }, 16000); };
    const stat = (r) => { let pk = 0, s = 0; for (const x of r.left) { assert.ok(Number.isFinite(x)); pk = Math.max(pk, Math.abs(x)); s += x * x; } return { pk, rms: Math.sqrt(s / r.left.length) }; };
    const road = stat(short('road3')), battle = stat(short('battle8')), cave = stat(short('cave2')), magic = stat(short('magic1')), hell = stat(short('hell1'));
    for (const x of [road, battle, cave, magic, hell]) assert.ok(x.pk < 0.95 && x.rms > 0.02, JSON.stringify(x));
    assert.ok(road.pk < battle.pk, 'the road softer');
    assert.ok(cave.pk <= road.pk + 0.02, 'the caves quiet');
});

test('the old mp3 music is not loaded any more', () => {
    const src = fs.readFileSync(new URL('../../src/audio/SoundManager.js', import.meta.url), 'utf8');
    assert.ok(!/key: 'm1'|key: 'battle'/.test(src));
});

test('the place for the music: a fight, hell, a cave, the tower, a castle, the road; space is quiet', () => {
    const base = (o = {}) => ({ character: { group: { position: { x: 0, y: 0, z: 0 } } }, localId: 'me', inFight: () => false, terrain: { data: {} }, ...o });
    assert.equal(musicPlace(base()).cat, 'adventure');
    assert.equal(musicPlace(base({ _inCave: true })).cat, 'cave');
    assert.equal(musicPlace(base({ hellGate: { inHell: true } })).cat, 'hell');
    assert.equal(musicPlace(base({ terrain: { data: { towers: { landAt: () => ({}) } } } })).cat, 'magic');
    assert.equal(musicPlace(base({ terrain: { data: { castles: { landAt: () => ({}) } } } })).cat, 'town');
    assert.equal(musicPlace(base({ space: { realm: 'space' } })), null);
    const z = (d) => ({ isDead: false, group: { position: { distanceTo: () => d } } });
    const few = musicPlace(base({ inFight: () => true, zombies: [z(5)] }));
    const boss = musicPlace(base({ inFight: () => true, zombies: [z(5)], diabolos: { awake: true } }));
    assert.equal(few.cat, 'battle');
    assert.ok(few.intensity < 0.4 && boss.intensity === 1, `${few.intensity} / ${boss.intensity}`);
});

/** A fake audio context (enough for the director: sources, gains, buffers, the clock). */
function fakeSound() {
    const ctx = {
        currentTime: 0,
        createBufferSource: () => ({ connect() {}, start() { this.started = true; }, stop() { this.stopped = true; }, buffer: null, loop: false }),
        createGain: () => ({ connect() {}, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} } }),
        createBuffer: (c, n) => ({ duration: n / MUSIC.SR, copyToChannel() {} }),
    };
    return { context: ctx, musicBus: () => ({}), musicSource: () => ({ src: ctx.createBufferSource(), gain: ctx.createGain() }) };
}

test('the director: the road\'s music after a quiet start; a fight — the battle at once, fiercer — up; calm again only after a while', () => {
    const snd = fakeSound();
    const D = new MusicDirector(snd);
    for (const t of TUNES) D.cache.set(t.id, { duration: 90 }); // (made: no worker in a test)
    D.start();
    const step = (secs, place) => { for (let i = 0; i < secs * 10; i++) { snd.context.currentTime += 0.1; D.update(0.1, place); } };
    step(4, { cat: 'adventure' });
    assert.equal(D.cur?.cat, 'adventure', 'the road\'s music');
    step(0.2, { cat: 'battle', intensity: 0.2 });
    assert.equal(D.cur?.cat, 'battle', 'a fight: at once');
    const first = D.cur.id;
    step(10, { cat: 'battle', intensity: 0.95 });
    assert.notEqual(D.cur.id, first, 'a boss: the fiercer tune');
    const fierce = D.cur.id;
    step(4, { cat: 'battle', intensity: 0.2 });
    assert.equal(D.cur.id, fierce, 'never down while it lasts');
    step(MUSIC.CALM_AFTER - 2, { cat: 'adventure' });
    assert.equal(D.cur?.cat, 'battle', 'the fight\'s music lingers a while');
    step(MUSIC.SETTLE + 8, { cat: 'adventure' });
    assert.ok(!D.cur || D.cur.cat === 'adventure', 'then calm again');
    // a border crossed back and forth: no new music each time
    const before = D.cur?.id;
    for (let k = 0; k < 6; k++) { step(0.5, { cat: 'town' }); step(0.5, { cat: 'adventure' }); }
    assert.ok(!D.cur || D.cur.id === before || D.cur.cat === 'adventure');
    // space: quiet
    step(1, null);
    assert.equal(D.cur, null);
});

test('nothing piles up: at most a few tunes kept made', () => {
    const snd = fakeSound();
    const D = new MusicDirector(snd);
    D._worker = { postMessage({ id }) { setTimeout(() => D._done.get(id)?.(new Float32Array(10), new Float32Array(10)), 0); } };
    D._done = new Map();
    return (async () => {
        for (const t of TUNES.slice(0, 12)) { D._make(t.id); await new Promise((r) => setTimeout(r, 2)); }
        assert.ok(D.cache.size <= MUSIC.CACHE, `kept ${D.cache.size}`);
    })();
});
