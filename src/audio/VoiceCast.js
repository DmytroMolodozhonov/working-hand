/**
 * VoiceCast.js — who speaks with which voice (pure, testable in node).
 *
 * The one hard rule: a woman ALWAYS speaks with a female voice and a man with
 * a male one — never mixed, for every speaking creature (farmers, merchants,
 * builders, knights, the king, wizards, sailors…). Within the right gender
 * every villager sounds a bit different: one of five voices, its own pitch
 * and its own pace, the same every time (seeded by the villager's id).
 *
 *  - Neural voices (Supertonic 3): F1–F5 are women, M1–M5 are men. The pitch
 *    is moved by playing the sound slightly faster/slower (the speed is
 *    compensated when synthesizing), and it is clamped so a man's voice never
 *    climbs into the female range and a woman's never sinks into the male one.
 *  - System voices (Web Speech API fallback): the gender is read from the
 *    voice name (Windows Irina/Pavel, Edge Svetlana/Dmitry/Dariya, macOS
 *    Milena/Yuri/Katya, Google…). A voice of the other gender is never used;
 *    when the browser has no voice of the right gender a voice of unknown
 *    gender may be used (its pitch bent toward the right side), and when it
 *    has none of those either, the villager speaks only with the text over
 *    the head.
 */

import { FEMALE_VOICES, MALE_VOICES } from './supertonic.js';

/** The voices' own median pitch (Hz), measured on Russian phrases. */
export const VOICE_F0 = { F1: 189, F2: 236, F3: 181, F4: 200, F5: 176, M1: 134, M2: 94, M3: 109, M4: 134, M5: 87 };

/** The gender line: a man stays at or below MALE_MAX_F0, a woman at or above FEMALE_MIN_F0. */
export const MALE_MAX_F0 = 145;
export const FEMALE_MIN_F0 = 168;

// Per role: which voices fit (deep voices for the king and the knights), the
// pitch factor and the pace. `wizard` and `sailor` are for the tower and ship
// crews; unknown roles use `villager`.
const ROLES = {
    king: { male: ['M5', 'M2'], female: ['F5', 'F3'], pitch: 0.96, speed: 0.88 },
    knight: { male: ['M2', 'M3', 'M5', 'M1'], female: ['F5', 'F3', 'F1'], pitch: 0.97, speed: 0.98 },
    builder: { pitch: 0.99, speed: 1.0 },
    farmer: { pitch: 1.0, speed: 1.07 },
    merchant: { pitch: 1.01, speed: 1.08 },
    advisor: { male: ['M3', 'M5', 'M1'], female: ['F3', 'F5', 'F1'], pitch: 0.98, speed: 0.93 },
    wizard: { male: ['M5', 'M2', 'M3', 'M1'], female: ['F3', 'F5', 'F1', 'F4'], pitch: 0.98, speed: 0.92 },
    sailor: { male: ['M3', 'M1', 'M4', 'M2'], pitch: 0.99, speed: 1.04 },
    villager: { pitch: 1, speed: 1.02 },
};

export function hash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const unit = (h, shift) => ((h >>> shift) & 0xff) / 255; // 0..1

/**
 * Is this speaker a woman? `female` (true/false) or `gender` ('female'/'male');
 * a speaker whose gender is not given is a man (the king, knights…).
 */
export function isFemale(opts = {}) {
    if (typeof opts.female === 'boolean') return opts.female;
    if (opts.gender === 'female' || opts.gender === 'f') return true;
    if (opts.gender === 'male' || opts.gender === 'm') return false;
    return false;
}

/**
 * The neural voice of a speaker.
 * @param {{voiceKey?:string|number, role?:string, female?:boolean, gender?:string, shout?:boolean}} opts
 * @returns {{voice:string, female:boolean, pitch:number, speed:number, f0:number}}
 *   pitch = playback-rate factor; speed = the pace heard by the player.
 */
export function castNeural(opts = {}) {
    const female = isFemale(opts);
    const role = ROLES[opts.role] || ROLES.villager;
    const key = opts.voiceKey ?? 'villager';
    const h = hash(`${key}|voice`);
    const pool = (female ? role.female : role.male) || (female ? FEMALE_VOICES : MALE_VOICES);
    const voice = pool[h % pool.length];
    const f0 = VOICE_F0[voice];
    // own pitch ±5 %, own pace ±7 %
    let pitch = role.pitch * (0.95 + unit(h, 8) * 0.1);
    let speed = role.speed * (0.93 + unit(h, 16) * 0.14);
    if (opts.shout) { pitch *= 1.05; speed *= 1.1; }
    // never across the gender line (and never cartoonish)
    if (female) pitch = clamp(pitch, Math.max(0.92, FEMALE_MIN_F0 / f0), 1.1);
    else pitch = clamp(pitch, 0.9, Math.min(1.08, MALE_MAX_F0 / f0));
    speed = clamp(speed, 0.8, 1.25);
    return { voice, female, pitch, speed, f0: f0 * pitch };
}

// ---------------------------------------------------------------- system voices

// Voice-name hints (Windows, Edge «Online (Natural)», macOS, Android, Chrome).
const FEMALE_HINT = /(milena|irina|katya|katja|anna|alena|alyona|elena|svetlana|dariya|darya|daria|tatyana|tatiana|yelena|ekaterina|olga|natalia|natasha|marina|polina|female|woman|женск|милена|ирина|катя|анна|алёна|алена|елена|светлана|дарья|татьяна|ольга|наталья|google\s*(русский|russian))/i;
const MALE_HINT = /(yuri|yury|pavel|dmitry|dmitri|maxim|artem|artyom|nikolai|nikolay|aleksandr|alexander|mikhail|ivan|sergey|sergei|boris|(?<!fe)male|(?<!wo)man\b|мужск|юрий|павел|дмитрий|максим|артём|артем|николай|михаил|александр|сергей|иван)/i;

/** 'female' | 'male' | 'unknown' — read from a system voice's name. */
export function systemVoiceGender(voice) {
    const n = `${voice?.name || ''} ${voice?.voiceURI || ''}`;
    if (MALE_HINT.test(n)) return 'male';
    if (FEMALE_HINT.test(n)) return 'female';
    return 'unknown';
}

/**
 * A system voice for a speaker, deterministic per voiceKey. Never a voice of
 * the other gender; null = there is no fitting voice (text only).
 */
export function pickSystemVoice(voices, voiceKey, female) {
    const list = (voices || []).filter(Boolean);
    if (!list.length) return null;
    const want = female ? 'female' : 'male';
    const right = list.filter((v) => systemVoiceGender(v) === want);
    const unknown = list.filter((v) => systemVoiceGender(v) === 'unknown');
    let pool = right.length ? right : unknown;
    if (!pool.length) return null;
    const local = pool.filter((v) => v.localService);
    if (local.length) pool = local;
    return pool[hash(voiceKey ?? 'villager') % pool.length];
}

const SYS_ROLE = {
    king: { rate: 0.86, pitch: 0.78 },
    knight: { rate: 0.96, pitch: 0.72 },
    builder: { rate: 1.0, pitch: 0.9 },
    farmer: { rate: 1.1, pitch: 1.0 },
    merchant: { rate: 1.06, pitch: 1.05 },
    advisor: { rate: 0.93, pitch: 0.88 },
    wizard: { rate: 0.92, pitch: 0.85 },
    sailor: { rate: 1.04, pitch: 0.92 },
};

/** Web Speech pitch (0..2) and rate for a speaker: role × gender × own jitter. */
export function systemVoiceParams({ voiceKey, role, voice, rate, pitch, shout, ...rest } = {}) {
    const female = isFemale(rest);
    const base = SYS_ROLE[role] || { rate: 1, pitch: 1 };
    const h = hash(`${voiceKey}|tone`);
    let p = base.pitch * (female ? 1.28 : 1) + (unit(h, 0) - 0.5) * 0.16;
    let r = base.rate + (unit(h, 8) - 0.5) * 0.12;
    const g = voice ? systemVoiceGender(voice) : 'unknown';
    // a voice of unknown gender: bend it firmly to the right side
    if (g === 'unknown') p += female ? 0.25 : -0.25;
    if (shout) { p += 0.12; r *= 1.15; }
    if (typeof pitch === 'number') p = pitch;
    if (typeof rate === 'number') r = rate;
    // a man's voice never goes high, a woman's never low
    p = female ? clamp(p, 1.0, 2) : clamp(p, 0.1, 1.05);
    return { pitch: p, rate: clamp(r, 0.5, 2) };
}
