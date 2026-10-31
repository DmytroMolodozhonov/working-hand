/**
 * VoiceChatRules.js — the voice chat between players: its modes, settings and how loud a friend is heard (pure: tests).
 *
 * The author: «1) голосовая игра через весь мир: что ты говоришь, слышно в любой момент и в любом месте — ты в пещере,
 * он очень-очень далеко, а вы друг друга слышите… не должно никак мешать взаимодействию с жителями; 2) то же, но только
 * в определённом радиусе, как в реальности: чем дальше — тем тише; 3) или отключить — по умолчанию отключена».
 *
 *   MODES            'off' | 'own' (свои устройства: Discord и т.п. — игра голос не передаёт) | 'world' | 'radius'
 *   normalizeSettings(s) / DEFAULTS        what the player chose (localStorage 'zns-voicechat'), always valid
 *   myMode(server, mine)                   the mode this computer plays in: the server's, unless the player chose less
 *   hearing({...})   → {gain, muffle, pan}  how a friend's voice is heard here (radius: distance, walls, water, air)
 *   radiusGain(d)                          the fall-off with distance (inverse distance, cut at RADIUS.CUT)
 *   topology(n, failed)                    'mesh' (each pair directly) or 'relay' (through the host)
 *   VOICE_TARGETS                          who / what the voice chat touches («кто/что», CLAUDE.md)
 */

export const MODES = ['off', 'own', 'world', 'radius'];

/** The player's words for the modes (the menus). */
export const MODE_TITLE = {
    off: 'Выключен',
    own: 'Через свои устройства (Discord и т.п.)',
    world: 'Общий голосовой через весь мир',
    radius: 'Общий голосовой с радиусом (как в жизни)',
};

/** What each mode gives (the menus' hint — what it is good for, then how to use it). */
export const MODE_HINT = {
    off: 'Игра не передаёт ваш голос. Включить можно в любой момент: Escape → «⚙ Общие настройки» → «Голос и чат».',
    own: 'Вы говорите с друзьями в Discord или другой программе, а игра это знает: голос друга из ваших колонок не станет вашим заклинанием и не заговорит с жителями за вас.',
    world: 'Вы слышите друзей всегда и везде — даже в пещере на другом конце мира. Просто говорите: игра передаёт только речь, тишину и шум не передаёт.',
    radius: 'Вы слышите друга, только когда он рядом (до 60 м), и тем тише, чем он дальше — как в жизни. Стены глушат голос, под водой он глухой, в космосе без воздуха его не слышно.',
};

/** The radius mode's distances (m): full loudness up to REF, fades as REF/d, nothing past CUT. */
export const RADIUS = {
    REF: 4, // (an arm's length or two: a normal talk is as loud as it gets)
    CUT: 60, // (the author: «только в определённом радиусе» — a shout across a yard, not across a valley)
    FADE: 12, // m before CUT where the voice fades to nothing (no click at the edge)
    WALL: 0.35, // gain behind a wall / rock between us (and a muffled voice)
    WATER: 0.5, // gain when one of us is under water (and a muffled voice)
};

/** The settings the player can change (and their defaults: the voice chat is off — the author). */
export const DEFAULTS = Object.freeze({
    mode: 'off',       // the mode a server is created with (the host's choice; remembered for the next server)
    me: 'auto',        // this player: 'auto' (as on the server) | 'own' (I use Discord etc.) | 'off' (no voice chat for me)
    volume: 100,       // %, the friends' voices (0…200)
    mic: '',           // the microphone (deviceId; '' — the system's)
    out: '',           // the output (deviceId; '' — the system's; only where the browser can choose: setSinkId)
    ptt: false,        // «нажми и говори»: the voice goes out only while the key is held
    pttKey: 'KeyT',     // (T — «talk»; V, B, N… are the game's own keys)
    aec: true,         // the browser's echo canceller on the microphone
    ns: true,          // the browser's noise suppressor
    agc: true,         // the browser's automatic gain
    sens: 50,          // the speech detector's sensitivity (0…100): higher — quieter speech goes out too
});

const clampInt = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** Any stored object → valid settings (an old or broken record never breaks the game). */
export function normalizeSettings(s) {
    const o = s && typeof s === 'object' ? s : {};
    return {
        mode: MODES.includes(o.mode) ? o.mode : DEFAULTS.mode,
        me: ['auto', 'own', 'off'].includes(o.me) ? o.me : DEFAULTS.me,
        volume: clampInt(o.volume, 0, 200, DEFAULTS.volume),
        mic: typeof o.mic === 'string' ? o.mic.slice(0, 200) : '',
        out: typeof o.out === 'string' ? o.out.slice(0, 200) : '',
        ptt: !!o.ptt,
        pttKey: typeof o.pttKey === 'string' && /^[A-Za-z0-9]{1,20}$/.test(o.pttKey) ? o.pttKey : DEFAULTS.pttKey,
        aec: o.aec !== false,
        ns: o.ns !== false,
        agc: o.agc !== false,
        sens: clampInt(o.sens, 0, 100, DEFAULTS.sens),
    };
}

export const STORE_KEY = 'zns-voicechat';

export function loadSettings(storage = globalThis.localStorage) {
    try { return normalizeSettings(JSON.parse(storage?.getItem(STORE_KEY) || 'null')); } catch (e) { return normalizeSettings(null); }
}

export function saveSettings(s, storage = globalThis.localStorage) {
    const n = normalizeSettings(s);
    try { storage?.setItem(STORE_KEY, JSON.stringify(n)); } catch (e) { /* not remembered: the game still works */ }
    return n;
}

/**
 * The mode this computer plays in. The server (the host) sets the voice chat for everybody; a player may only take
 * less: «свои устройства» (he talks over Discord — the game sends nothing, but knows it) or «выключено».
 */
export function myMode(server, me = 'auto') {
    const s = MODES.includes(server) ? server : 'off';
    if (me === 'off') return 'off';
    if (me === 'own') return s === 'off' ? 'off' : 'own';
    return s;
}

/** Does this mode carry voices through the game (calls between the computers)? */
export const carries = (mode) => mode === 'world' || mode === 'radius';

/** The radius mode's fall-off: 1 near, REF/d farther, fading to 0 over the last FADE m before CUT. */
export function radiusGain(d, r = RADIUS) {
    if (!(d >= 0)) return 0;
    if (d >= r.CUT) return 0;
    let g = d <= r.REF ? 1 : r.REF / d;
    const edge = r.CUT - r.FADE;
    if (d > edge) g *= (r.CUT - d) / r.FADE;
    return Math.max(0, Math.min(1, g));
}

/**
 * How a friend's voice is heard here.
 * @param {object} a  { mode, dist (m, listener — the camera — to the friend's head), wall (something solid between: true/false),
 *                     meRealm, himRealm ('earth' | 'space' | a planet id), airless (realm → true when there is no air),
 *                     meWater, himWater (a head under water), volume (0…2) }
 * @returns {{gain:number, muffle:number, spatial:boolean, why:string}}  muffle 0…1 (0 — clear; 1 — very dull: low-pass)
 */
export function hearing(a) {
    const vol = Number.isFinite(a.volume) ? Math.max(0, Math.min(2, a.volume)) : 1;
    if (a.mode === 'world') return { gain: vol, muffle: 0, spatial: false, why: 'весь мир' };
    if (a.mode !== 'radius') return { gain: 0, muffle: 0, spatial: false, why: 'не передаётся' };
    // (no air — space, a planet without air: sound has nothing to go through, whatever the distance)
    const airless = a.airless || (() => false);
    if (a.meRealm === 'space' || a.himRealm === 'space') return { gain: 0, muffle: 0, spatial: true, why: 'космос: нет воздуха' };
    if (a.meRealm !== a.himRealm) return { gain: 0, muffle: 0, spatial: true, why: 'другое место (другая планета)' };
    if (airless(a.meRealm)) return { gain: 0, muffle: 0, spatial: true, why: 'нет воздуха' };
    let g = radiusGain(a.dist);
    if (g <= 0) return { gain: 0, muffle: 0, spatial: true, why: 'далеко' };
    let muffle = 0, why = 'рядом';
    if (a.wall) { g *= RADIUS.WALL; muffle = Math.max(muffle, 0.6); why = 'за стеной'; }
    if (a.meWater || a.himWater) { g *= RADIUS.WATER; muffle = Math.max(muffle, 0.85); why = 'под водой'; }
    return { gain: g * vol, muffle, spatial: true, why };
}

/** The low-pass for a muffled voice (Hz): clear 12 kHz, behind a wall ~1.2 kHz, under water ~500 Hz. */
export const muffleHz = (m) => Math.round(12000 * Math.pow(500 / 12000, Math.max(0, Math.min(1, m))));

/** Up to this many players every pair talks directly; more — through the host (its line carries them). */
export const MESH_MAX = 6;

/**
 * Each pair directly ('mesh') or through the host ('relay'). A pair whose direct link failed goes through the host
 * whatever the number (two strict routers): `failed` — a Set of 'a|b' keys (sorted ids).
 */
export function topology(n, failed = null) {
    return { all: n > MESH_MAX ? 'relay' : 'mesh', relayPair: (a, b) => n > MESH_MAX || !!failed?.has(pairKey(a, b)) };
}

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Of a pair, the one that calls (the other answers): never both at once. */
export const caller = (a, b) => (a < b ? a : b);

/** Opus as the voice chat wants it: speech up to 24 kHz, in-band error correction for lost packets, no packets in silence. */
export function opusSdp(sdp, kbps = 24) {
    const m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
    if (!m) return sdp;
    const pt = m[1];
    const want = `minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxplaybackrate=24000;sprop-maxcapturerate=24000;maxaveragebitrate=${Math.round(kbps * 1000)}`;
    const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    if (re.test(sdp)) {
        return sdp.replace(re, (all, params) => {
            const keep = params.split(';').filter((p) => p && !/^(minptime|useinbandfec|usedtx|stereo|sprop-stereo|maxplaybackrate|sprop-maxcapturerate|maxaveragebitrate)=/.test(p.trim()));
            return `a=fmtp:${pt} ${[...keep, want].join(';')}`;
        });
    }
    return sdp.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${want}`);
}

/** The bitrate (kbit/s) a voice gets: less through the slow free go-between (TURN ~50 kbit/s a player). */
export const voiceKbps = (relayed) => (relayed ? 12 : 24);

/**
 * Who and what the voice chat touches (CLAUDE.md: «кто/что × как действует» — the voice is no spell, but it is decided).
 * does: 'hears' | 'none'; why — the reason, said in the code.
 */
export const VOICE_TARGETS = {
    player: { does: 'hears', why: 'игроки одного мира слышат друг друга (по режиму сервера); игроки другого сервера — никогда' },
    villagers: { does: 'none', why: 'голос друга идёт только в уши игрока: жители, рыцари, моряки его не слышат; с жителями говорят по правилам игры — к ним надо обратиться (посмотреть на них, позвать)' },
    creatures: { does: 'none', why: 'звери, зомби, драконы, Королева, скелеты и прочие на голос из чата не отзываются' },
    spells: { does: 'none', why: 'голос друга никогда не колдует у меня: игра знает, что звучит в колонках (EchoGuard)' },
    world: { does: 'none', why: 'голос не ломает, не двигает и не будит ничего в мире' },
    space: { does: 'radius', why: 'в режиме «с радиусом» в космосе и без воздуха голоса нет; «через весь мир» — это связь, работает везде' },
};
