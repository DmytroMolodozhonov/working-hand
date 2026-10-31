/**
 * GrabSounds.js — лапа монстра и тело в ней (MonsterGrab.js). Делается заранее на экране загрузки (SoundManager.prewarmStep),
 * никогда в момент. Каждый звук — из нескольких слоёв:
 *   grab    — огромные пальцы смыкаются на теле: глухой мясистый шлепок ладони, шорох шерсти и одежды, низкий «ух» воздуха;
 *   squeeze — тело сдавливают: скрип и треск суставов (короткие щелчки разной высоты), глухой стон ткани, низкий гул напряжения;
 *   crunch  — раздавлено: серия ломающихся костей (сухие щелчки, всё чаще), мокрый хлюп, тяжёлый глухой удар кулака в конце.
 */
export const GRAB_SOUNDS = ['grab', 'squeeze', 'crunch'];

function noise(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}
function reso(st, x, f, q, sr) {
    const w = (2 * Math.PI * f) / sr, r = Math.exp(-w / (2 * q));
    const y = x * (1 - r) + 2 * r * Math.cos(w) * st.y1 - r * r * st.y2;
    st.y2 = st.y1; st.y1 = y;
    return y;
}

export function synthGrab(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = { grab: 0.45, squeeze: 0.7, crunch: 1.1 }[kind] || 0.5;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const rnd = noise(311 + kind.length * 977 + kind.charCodeAt(0) * 13);
    const a = { y1: 0, y2: 0 }, b = { y1: 0, y2: 0 }, c = { y1: 0, y2: 0 };
    let lp = 0, ph = 0;
    // щелчки костей: моменты и высоты заранее (тот же звук при каждой загрузке)
    const clicks = [];
    if (kind !== 'grab') {
        const n = kind === 'crunch' ? 14 : 5;
        let t = kind === 'crunch' ? 0.02 : 0.08;
        for (let i = 0; i < n; i++) {
            clicks.push({ t, f: 1400 + (rnd() + 1) * 1600, a: 0.5 + 0.5 * Math.abs(rnd()) });
            t += kind === 'crunch' ? 0.045 * (1 - i / (n + 4)) + Math.abs(rnd()) * 0.02 : 0.09 + Math.abs(rnd()) * 0.08;
        }
    }
    for (let i = 0; i < len; i++) {
        const t = i / sr, n = rnd();
        let v = 0;
        if (kind === 'grab') {
            // шлепок ладони (низкое тело 70–110 Гц), шорох (полоса 2,5 кГц), воздух
            ph += (2 * Math.PI * (70 + 45 * Math.exp(-t / 0.03))) / sr;
            lp += (n - lp) * 0.08;
            v = Math.sin(ph) * Math.exp(-t / 0.09) * 0.9
                + reso(a, n, 2500, 1.5, sr) * Math.exp(-t / 0.05) * 0.5
                + lp * Math.exp(-t / 0.18) * 0.6;
        } else {
            // треск костей
            for (const k of clicks) {
                const u = t - k.t;
                if (u < 0 || u > 0.03) continue;
                v += reso(b, n, k.f, 6, sr) * Math.exp(-u / 0.004) * k.a * 1.6;
            }
            // стон ткани и напряжение (низкий гул, медленно дрожит)
            lp += (n - lp) * 0.03;
            const groan = reso(c, n, 180 + 40 * Math.sin(t * 9), 3, sr) * (kind === 'crunch' ? 0.7 : 0.9);
            v += groan * Math.sin(Math.PI * Math.min(1, t / dur)) + lp * 0.3;
            if (kind === 'crunch') {
                // мокрый хлюп в середине и удар кулака в конце
                const w = t - 0.35;
                if (w > 0 && w < 0.25) v += reso(a, n, 600 + 900 * Math.exp(-w / 0.05), 2, sr) * Math.exp(-w / 0.07) * 1.1;
                const e = t - 0.62;
                if (e > 0) { ph += (2 * Math.PI * (55 + 50 * Math.exp(-e / 0.02))) / sr; v += Math.sin(ph) * Math.exp(-e / 0.12) * 1.1; }
            }
        }
        d[i] = Math.max(-1, Math.min(1, v * 0.7));
    }
    return buf;
}
