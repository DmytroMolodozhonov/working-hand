// The voice chat's rules: modes, settings (stored, broken records), loudness by distance, walls / water / space,
// the pairs (directly or through the host), Opus. (The calls themselves: tests/e2e/voicechat.test.mjs, two browsers.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, DEFAULTS, normalizeSettings, loadSettings, saveSettings, myMode, carries, hearing, radiusGain, RADIUS, muffleHz, topology, pairKey, caller, opusSdp, voiceKbps, MESH_MAX, VOICE_TARGETS, MODE_HINT } from '../../src/net/VoiceChatRules.js';

test('the voice chat is off by default; a broken record never breaks the game', () => {
    assert.equal(DEFAULTS.mode, 'off');
    assert.deepEqual(normalizeSettings(null), { ...DEFAULTS });
    const s = normalizeSettings({ mode: 'radio', me: 7, volume: 999, sens: -4, mic: 5, ptt: 'yes', pttKey: '<script>', aec: false });
    assert.equal(s.mode, 'off');
    assert.equal(s.me, 'auto');
    assert.equal(s.volume, 200);
    assert.equal(s.sens, 0);
    assert.equal(s.mic, '');
    assert.equal(s.ptt, true);
    assert.equal(s.pttKey, DEFAULTS.pttKey);
    assert.equal(s.aec, false);
    assert.equal(s.ns, true);
});

test('settings are remembered (and a storage that throws is no error)', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    saveSettings({ mode: 'radius', volume: 140, ptt: true }, storage);
    const s = loadSettings(storage);
    assert.equal(s.mode, 'radius');
    assert.equal(s.volume, 140);
    assert.equal(s.ptt, true);
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    assert.equal(loadSettings(bad).mode, 'off');
    assert.equal(saveSettings({ mode: 'world' }, bad).mode, 'world');
    mem.set('zns-voicechat', '{not json');
    assert.equal(loadSettings(storage).mode, 'off');
});

test('my mode: the server sets it, a player may only take less', () => {
    for (const m of MODES) assert.equal(myMode(m, 'auto'), m);
    assert.equal(myMode('world', 'own'), 'own', 'говорю через Discord — игра голос не передаёт');
    assert.equal(myMode('radius', 'off'), 'off');
    assert.equal(myMode('off', 'own'), 'off', 'на сервере выключено — выключено и у меня');
    assert.equal(myMode('nonsense', 'auto'), 'off');
    assert.ok(carries('world') && carries('radius') && !carries('own') && !carries('off'));
});

test('radius: loud near, quieter farther, nothing past the cut (no click at the edge)', () => {
    assert.equal(radiusGain(0), 1);
    assert.equal(radiusGain(RADIUS.REF), 1);
    assert.ok(radiusGain(10) < radiusGain(5));
    assert.ok(radiusGain(30) < radiusGain(10));
    assert.equal(radiusGain(RADIUS.CUT), 0);
    assert.equal(radiusGain(500), 0);
    assert.ok(radiusGain(RADIUS.CUT - 0.5) < 0.01, 'у края голос уже почти не слышен');
    let prev = 2;
    for (let d = 0; d <= RADIUS.CUT; d += 0.5) { const g = radiusGain(d); assert.ok(g <= prev + 1e-9, `громкость не растёт с расстоянием (${d} м)`); prev = g; }
    assert.equal(radiusGain(NaN), 0);
});

test('hearing: the whole world always; radius — distance, walls, water, space, another planet', () => {
    const base = { mode: 'radius', dist: 8, meRealm: 'earth', himRealm: 'earth', volume: 1 };
    assert.equal(hearing({ mode: 'world', dist: 1e6, meRealm: 'space', himRealm: 'earth', volume: 1 }).gain, 1, 'через весь мир — слышно и в космосе, и в пещере');
    const open = hearing(base);
    assert.ok(open.gain > 0 && open.muffle === 0);
    const wall = hearing({ ...base, wall: true });
    assert.ok(wall.gain < open.gain && wall.muffle > 0, 'стена глушит');
    const water = hearing({ ...base, himWater: true });
    assert.ok(water.gain < open.gain && water.muffle > wall.muffle, 'под водой глуше');
    assert.equal(hearing({ ...base, meRealm: 'space', himRealm: 'space' }).gain, 0, 'в космосе нет воздуха');
    assert.equal(hearing({ ...base, himRealm: 'mars' }).gain, 0, 'другая планета');
    assert.equal(hearing({ ...base, meRealm: 'moon', himRealm: 'moon', airless: (r) => r === 'moon' }).gain, 0, 'на Луне нет воздуха');
    assert.ok(hearing({ ...base, meRealm: 'mars', himRealm: 'mars', airless: () => false }).gain > 0, 'на Марсе (воздух есть) — слышно');
    assert.equal(hearing({ ...base, dist: 200 }).gain, 0);
    assert.equal(hearing({ ...base, mode: 'own' }).gain, 0, 'свои устройства — игра голос не передаёт');
    assert.ok(Math.abs(hearing({ ...base, volume: 2 }).gain - 2 * open.gain) < 1e-9);
    assert.ok(muffleHz(0) > 10000 && muffleHz(1) <= 600 && muffleHz(0.6) < 2500);
});

test('pairs: directly up to MESH_MAX players, through the host beyond — or when the direct link failed', () => {
    const small = topology(MESH_MAX);
    assert.equal(small.all, 'mesh');
    assert.equal(small.relayPair('a', 'b'), false);
    const big = topology(MESH_MAX + 1);
    assert.equal(big.relayPair('a', 'b'), true, 'много игроков — через хоста');
    const failed = new Set([pairKey('zz', 'aa')]);
    assert.equal(topology(3, failed).relayPair('aa', 'zz'), true, 'строгий роутер — через хоста');
    assert.equal(pairKey('b', 'a'), pairKey('a', 'b'));
    assert.equal(caller('H', 'x7'), caller('x7', 'H'), 'звонит всегда один из пары');
});

test('Opus: 24 kHz speech, error correction for lost packets, no packets in silence; less over the slow go-between', () => {
    const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=0\r\na=rtpmap:0 PCMU/8000\r\n';
    const out = opusSdp(sdp, voiceKbps(false));
    assert.match(out, /a=fmtp:111 [^\r\n]*useinbandfec=1/);
    assert.match(out, /usedtx=1/);
    assert.match(out, /maxplaybackrate=24000/);
    assert.match(out, /maxaveragebitrate=24000/);
    assert.doesNotMatch(out, /useinbandfec=0/);
    const noFmtp = opusSdp('m=audio 9 X 111\r\na=rtpmap:111 opus/48000/2\r\n', voiceKbps(true));
    assert.match(noFmtp, /a=fmtp:111 [^\r\n]*maxaveragebitrate=12000/);
    assert.equal(opusSdp('m=audio 9 X 0\r\na=rtpmap:0 PCMU/8000\r\n'), 'm=audio 9 X 0\r\na=rtpmap:0 PCMU/8000\r\n');
});

test('who / what the voice chat touches is decided (CLAUDE.md «кто/что»), the hints tell the player what each mode gives', () => {
    for (const k of ['player', 'villagers', 'creatures', 'spells', 'world', 'space']) assert.ok(VOICE_TARGETS[k]?.why, k);
    assert.equal(VOICE_TARGETS.villagers.does, 'none');
    for (const m of MODES) assert.ok(MODE_HINT[m] && /(^|[^а-яё])(вы|вас|ваш|вам)/i.test(MODE_HINT[m]), `подсказка режима ${m} — обращением к игроку`);
});
