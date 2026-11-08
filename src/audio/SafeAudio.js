/**
 * SafeAudio.js — a sound never stops the game (the author's critical error during «Авада Кедавра»: «Failed to execute
 * 'linearRampToValueAtTime' on 'AudioParam': The provided float value is non-finite»). The browser THROWS on a NaN / Infinity value or
 * time given to an AudioParam — one bad number in any of ~50 ramps (volumes, fades, filters) broke the whole frame. Installed once
 * (imported by SoundManager / MagicSound): a non-finite value becomes the param's current value (or 0), a non-finite time — «now»;
 * the first few such calls are written to the console with the stack, so the real source can still be found and fixed.
 */
export const SAFE_AUDIO = { warned: 0, MAX_WARN: 5 };

const fin = Number.isFinite;

function warn(name, args) {
    if (SAFE_AUDIO.warned >= SAFE_AUDIO.MAX_WARN) return;
    SAFE_AUDIO.warned++;
    console.warn(`🔊 звук: ${name}(${args.map(String).join(', ')}) — не число, заменено`, new Error().stack);
}

/** Wrap `proto[name]` so its (value, time, …) are finite. `valueAt`/`timeAt` — the indices of the value and of the time arguments. */
function guard(proto, name, valueAt, timeAt) {
    const orig = proto?.[name];
    if (typeof orig !== 'function' || orig.__safe) return;
    const safe = function (...a) {
        let bad = false;
        if (valueAt >= 0 && !fin(a[valueAt])) { bad = true; const cur = this.value; a[valueAt] = fin(cur) ? cur : 0; }
        if (timeAt >= 0 && !fin(a[timeAt])) { bad = true; a[timeAt] = this.context?.currentTime ?? 0; }
        // (the time constant of setTargetAtTime must be finite and > 0)
        if (name === 'setTargetAtTime' && !(fin(a[2]) && a[2] > 0)) { bad = true; a[2] = 0.05; }
        // (an exponential ramp needs a positive value)
        if (name === 'exponentialRampToValueAtTime' && !(a[0] > 0)) { bad = true; a[0] = 0.0001; }
        if (bad) warn(name, a);
        return orig.apply(this, a);
    };
    safe.__safe = true;
    proto[name] = safe;
}

export function installSafeAudio(root = typeof globalThis !== 'undefined' ? globalThis : null) {
    const P = root?.AudioParam?.prototype;
    if (!P) return false;
    guard(P, 'setValueAtTime', 0, 1);
    guard(P, 'linearRampToValueAtTime', 0, 1);
    guard(P, 'exponentialRampToValueAtTime', 0, 1);
    guard(P, 'setTargetAtTime', 0, 1);
    guard(P, 'cancelScheduledValues', -1, 0);
    guard(P, 'cancelAndHoldAtTime', -1, 0);
    // (`param.value = NaN` throws the same way)
    const d = Object.getOwnPropertyDescriptor(P, 'value');
    if (d?.set && !d.set.__safe) {
        const set = function (v) { if (!fin(v)) { warn('value=', [v]); return; } d.set.call(this, v); };
        set.__safe = true;
        Object.defineProperty(P, 'value', { ...d, set });
    }
    return true;
}

installSafeAudio();
