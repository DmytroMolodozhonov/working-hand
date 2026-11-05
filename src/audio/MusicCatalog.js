/**
 * MusicCatalog.js — the forty tunes of the game (the author 05.11): ten of the road (adventure — soft, pleasant, a little of a journey,
 * under the game, never in the way), ten of battle (from a skirmish to a boss, `intensity` 0.1…1 — the director goes up them as the fight
 * grows), five of the caves (dark, sparse, echoing), five of hell (phrygian, war drums, a saturated drone, a low choir), five of the towns
 * and villages (folk: a lute, a fiddle, a frame drum), five of the wizards' towns and the tower (lydian, a celesta, a harp, a choir).
 * Each its own key, mode, tempo, chords, instruments and seed (its motifs) — MusicComposer.js writes and plays them.
 *
 * Progressions are [scale degree, bars]: 0 the tonic … 6; sections I (intro / outro), A, B; the form a string of them.
 */

const A = (o) => ({ cat: 'adventure', feel: 'calm', pad: 'strings', bass: 'bass', form: 'IAABAO', reverb: 0.3, level: 0.5, ...o });
const T = (o) => ({ cat: 'town', feel: 'lively', pad: null, bass: 'bass', bassStyle: 'walk', perc: 'folk', form: 'IAABAO', reverb: 0.2, level: 0.52, ...o });
const M = (o) => ({ cat: 'magic', feel: 'calm', pad: 'choir', bass: 'bass', bassStyle: 'long', seventh: true, form: 'IAABAO', reverb: 0.45, hall: 1.2, level: 0.5, ...o });
const C = (o) => ({ cat: 'cave', feel: 'sparse', pad: 'strings', padVel: 0.6, bass: null, drone: 'drone', form: 'IAABAO', reverb: 0.6, hall: 1.35, level: 0.42, density: 0.75, ...o });
const H = (o) => ({ cat: 'hell', feel: 'sparse', pad: 'choir', bass: 'bass', bassStyle: 'long', drone: 'darkdrone', perc: 'war', form: 'IAABAO', reverb: 0.4, hall: 1.3, level: 0.55, ...o });
const B = (o) => ({ cat: 'battle', feel: 'battle', pad: 'strings', bass: 'bass', bassStyle: 'pulse', perc: 'taiko', form: 'AABA', reverb: 0.22, loop: true, level: 0.62, ...o });

export const TUNES = [
    // ------------------------------------------------------------------ the road (10)
    A({ id: 'road1', ru: 'Утро в пути', seed: 101, key: 62, mode: 'major', tempo: 92, melody: 'flute', arp: 'harp', sections: { I: [[0, 2]], A: [[0, 2], [4, 2], [5, 2], [3, 2]], B: [[3, 2], [0, 2], [3, 2], [4, 2]] } }),
    A({ id: 'road2', ru: 'Тропа через холмы', seed: 202, key: 60, mode: 'mixolydian', tempo: 100, melody: 'fiddle', arp: 'lute', perc: 'soft', sections: { I: [[0, 2]], A: [[0, 2], [6, 2], [3, 2], [0, 2]], B: [[3, 2], [6, 2], [4, 2], [0, 2]] } }),
    A({ id: 'road3', ru: 'Ветер в траве', seed: 303, key: 65, mode: 'major', tempo: 84, melody: 'flute', arp: 'harp', arpPattern: [0, 1, 2, 3, 2, 1], sections: { I: [[0, 2]], A: [[0, 2], [5, 2], [1, 2], [4, 2]], B: [[5, 2], [3, 2], [0, 2], [4, 2]] } }),
    A({ id: 'road4', ru: 'Старая дорога', seed: 404, key: 57, mode: 'dorian', tempo: 96, melody: 'fiddle', arp: 'lute', sections: { I: [[0, 2]], A: [[0, 2], [3, 2], [0, 2], [6, 2]], B: [[2, 2], [3, 2], [6, 2], [0, 2]] } }),
    A({ id: 'road5', ru: 'Река и мост', seed: 505, key: 67, mode: 'major', tempo: 104, melody: 'harp', arp: 'lute', counter: 'flute', sections: { I: [[0, 2]], A: [[0, 2], [3, 2], [4, 2], [0, 2]], B: [[5, 2], [1, 2], [4, 2], [4, 2]] } }),
    A({ id: 'road6', ru: 'Дальние горы', seed: 606, key: 59, mode: 'minor', tempo: 88, melody: 'flute', arp: 'harp', counter: 'strings', sections: { I: [[0, 2]], A: [[0, 2], [5, 2], [2, 2], [6, 2]], B: [[3, 2], [0, 2], [3, 2], [4, 2]] } }),
    A({ id: 'road7', ru: 'Поляна у леса', seed: 707, key: 64, mode: 'major', tempo: 110, feel: 'lively', melody: 'flute', arp: 'lute', perc: 'soft', sections: { I: [[0, 2]], A: [[0, 1], [3, 1], [4, 1], [0, 1], [5, 1], [3, 1], [4, 2]], B: [[3, 2], [4, 2], [2, 2], [5, 2]] } }),
    A({ id: 'road8', ru: 'Закат над полем', seed: 808, key: 61, mode: 'major', tempo: 80, melody: 'strings', arp: 'harp', padVel: 0.7, sections: { I: [[0, 2]], A: [[0, 2], [2, 2], [3, 2], [4, 2]], B: [[5, 2], [4, 2], [3, 2], [4, 2]] } }),
    A({ id: 'road9', ru: 'Следы на снегу', seed: 909, key: 56, mode: 'dorian', tempo: 86, melody: 'flute', arp: 'harp', arpPattern: [0, 2, 1, 2, 0, 2, 1, 2], sections: { I: [[0, 2]], A: [[0, 2], [3, 2], [6, 2], [0, 2]], B: [[3, 2], [4, 2], [6, 2], [6, 2]] } }),
    A({ id: 'road10', ru: 'Свободный путь', seed: 1010, key: 63, mode: 'mixolydian', tempo: 108, feel: 'lively', melody: 'fiddle', arp: 'harp', perc: 'soft', counter: 'flute', sections: { I: [[0, 2]], A: [[0, 2], [6, 2], [3, 2], [4, 2]], B: [[3, 2], [6, 2], [0, 2], [4, 2]] } }),
    // ------------------------------------------------------------------ battle (10): from a skirmish to a boss
    B({ id: 'battle1', ru: 'Стычка', intensity: 0.15, seed: 1101, key: 57, mode: 'dorian', tempo: 120, melody: 'fiddle', arp: 'lute', perc: 'taiko', sections: { A: [[0, 2], [6, 2], [3, 2], [0, 2]], B: [[3, 2], [4, 2], [6, 2], [4, 2]] } }),
    B({ id: 'battle2', ru: 'Засада', intensity: 0.25, seed: 1202, key: 55, mode: 'minor', tempo: 126, melody: 'brass', arp: 'pluck', sections: { A: [[0, 2], [5, 2], [6, 2], [0, 2]], B: [[3, 2], [0, 2], [3, 2], [4, 2]] } }),
    B({ id: 'battle3', ru: 'Звон клинков', intensity: 0.35, seed: 1303, key: 62, mode: 'harmonic', tempo: 132, melody: 'fiddle', arp: 'lute', arpPattern: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1], sections: { A: [[0, 2], [4, 2], [0, 2], [4, 2]], B: [[5, 2], [3, 2], [1, 2], [4, 2]] } }),
    B({ id: 'battle4', ru: 'Рыцари наступают', intensity: 0.45, seed: 1404, key: 60, mode: 'minor', tempo: 136, melody: 'brass', arp: 'pluck', counter: 'strings', sections: { A: [[0, 2], [6, 2], [5, 2], [4, 2]], B: [[3, 2], [4, 2], [0, 2], [4, 2]] } }),
    B({ id: 'battle5', ru: 'Дуэль', intensity: 0.55, seed: 1505, key: 58, mode: 'harmonic', tempo: 140, melody: 'fiddle', arp: 'harp', arpPattern: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2], counter: 'brass', sections: { A: [[0, 2], [5, 2], [3, 2], [4, 2]], B: [[0, 2], [3, 2], [5, 2], [4, 2]] } }),
    B({ id: 'battle6', ru: 'Осада', intensity: 0.65, seed: 1606, key: 53, mode: 'minor', tempo: 142, melody: 'brass', arp: 'pluck', pad: 'choir', counter: 'strings', sections: { A: [[0, 2], [5, 2], [6, 2], [4, 2]], B: [[3, 2], [6, 2], [2, 2], [4, 2]] } }),
    B({ id: 'battle7', ru: 'Буря заклинаний', intensity: 0.72, seed: 1707, key: 63, mode: 'phrygian', tempo: 146, melody: 'brass', arp: 'celesta', pad: 'choir', counter: 'fiddle', sections: { A: [[0, 2], [1, 2], [0, 2], [6, 2]], B: [[5, 2], [1, 2], [4, 2], [0, 2]] } }),
    B({ id: 'battle8', ru: 'Последний рубеж', intensity: 0.8, seed: 1808, key: 52, mode: 'harmonic', tempo: 150, melody: 'brass', arp: 'pluck', pad: 'choir', counter: 'strings', sections: { A: [[0, 2], [5, 2], [3, 2], [4, 2]], B: [[0, 1], [6, 1], [5, 1], [4, 1], [3, 2], [4, 2]] } }),
    B({ id: 'battle9', ru: 'Ярость дракона', intensity: 0.9, seed: 1909, key: 50, mode: 'phrygianDom', tempo: 154, melody: 'brass', arp: 'pluck', pad: 'choir', counter: 'fiddle', drone: 'darkdrone', sections: { A: [[0, 2], [1, 2], [0, 2], [6, 2]], B: [[3, 2], [1, 2], [6, 2], [0, 2]] } }),
    B({ id: 'battle10', ru: 'Битва с боссом', intensity: 1, seed: 2010, key: 49, mode: 'harmonic', tempo: 160, melody: 'brass', arp: 'pluck', pad: 'choir', counter: 'strings', drone: 'drone', sections: { A: [[0, 2], [5, 2], [1, 2], [4, 2]], B: [[0, 1], [5, 1], [3, 1], [4, 1], [0, 1], [6, 1], [4, 2]] } }),
    // ------------------------------------------------------------------ caves (5)
    C({ id: 'cave1', ru: 'Капли во тьме', seed: 3101, key: 50, mode: 'minor', tempo: 62, melody: 'celesta', arp: null, sections: { I: [[0, 2]], A: [[0, 4], [5, 4]], B: [[3, 4], [4, 4]] } }),
    C({ id: 'cave2', ru: 'Глубина', seed: 3202, key: 48, mode: 'phrygian', tempo: 58, melody: 'flute', sections: { I: [[0, 2]], A: [[0, 4], [1, 4]], B: [[6, 4], [0, 4]] } }),
    C({ id: 'cave3', ru: 'Кристаллы', seed: 3303, key: 55, mode: 'dorian', tempo: 66, melody: 'bell', arp: 'harp', arpPattern: [0, 2, 1, 2], sections: { I: [[0, 2]], A: [[0, 4], [3, 4]], B: [[5, 4], [4, 4]] } }),
    C({ id: 'cave4', ru: 'Шёпот камня', seed: 3404, key: 47, mode: 'minor', tempo: 60, melody: 'strings', pad: 'choir', sections: { I: [[0, 2]], A: [[0, 4], [5, 2], [6, 2]], B: [[3, 4], [0, 4]] } }),
    C({ id: 'cave5', ru: 'Подземная река', seed: 3505, key: 52, mode: 'harmonic', tempo: 70, melody: 'harp', arp: 'pluck', arpPattern: [0, 1, 2, 1], sections: { I: [[0, 2]], A: [[0, 2], [5, 2], [3, 2], [4, 2]], B: [[0, 4], [4, 4]] } }),
    // ------------------------------------------------------------------ hell (5)
    H({ id: 'hell1', ru: 'Врата ада', seed: 4101, key: 45, mode: 'phrygianDom', tempo: 72, melody: 'brass', sections: { I: [[0, 2]], A: [[0, 2], [1, 2], [0, 2], [6, 2]], B: [[1, 4], [0, 4]] } }),
    H({ id: 'hell2', ru: 'Река огня', seed: 4202, key: 44, mode: 'phrygian', tempo: 84, melody: 'fiddle', arp: 'pluck', sections: { I: [[0, 2]], A: [[0, 2], [1, 2], [5, 2], [1, 2]], B: [[3, 2], [1, 2], [0, 4]] } }),
    H({ id: 'hell3', ru: 'Цепи Дьяволоса', seed: 4303, key: 43, mode: 'harmonic', tempo: 68, melody: 'brass', counter: 'choir', sections: { I: [[0, 2]], A: [[0, 4], [5, 2], [4, 2]], B: [[1, 4], [4, 4]] } }),
    H({ id: 'hell4', ru: 'Пепел', seed: 4404, key: 46, mode: 'phrygian', tempo: 76, melody: 'bell', arp: 'pluck', sections: { I: [[0, 2]], A: [[0, 2], [6, 2], [1, 2], [0, 2]], B: [[5, 2], [1, 2], [6, 2], [0, 2]] } }),
    H({ id: 'hell5', ru: 'Горгульи над бездной', seed: 4505, key: 42, mode: 'phrygianDom', tempo: 92, feel: 'battle', melody: 'brass', arp: 'pluck', density: 0.8, sections: { I: [[0, 2]], A: [[0, 2], [1, 2], [0, 2], [1, 2]], B: [[6, 2], [5, 2], [1, 2], [0, 2]] } }),
    // ------------------------------------------------------------------ towns and villages (5)
    T({ id: 'town1', ru: 'Рыночная площадь', seed: 5101, key: 62, mode: 'major', tempo: 116, melody: 'fiddle', arp: 'lute', sections: { I: [[0, 2]], A: [[0, 2], [4, 2], [0, 2], [4, 2]], B: [[3, 2], [0, 2], [3, 2], [4, 2]] } }),
    T({ id: 'town2', ru: 'Таверна', seed: 5202, key: 60, mode: 'mixolydian', tempo: 124, melody: 'lute', arp: 'harp', counter: 'fiddle', sections: { I: [[0, 2]], A: [[0, 2], [6, 2], [3, 2], [0, 2]], B: [[3, 2], [4, 2], [6, 2], [0, 2]] } }),
    T({ id: 'town3', ru: 'Деревенский праздник', seed: 5303, key: 67, mode: 'major', tempo: 126, melody: 'flute', arp: 'lute', sections: { I: [[0, 2]], A: [[0, 1], [3, 1], [4, 1], [0, 1], [0, 1], [3, 1], [4, 2]], B: [[5, 2], [3, 2], [4, 2], [0, 2]] } }),
    T({ id: 'town4', ru: 'Под стенами замка', seed: 5404, key: 57, mode: 'dorian', tempo: 104, melody: 'fiddle', arp: 'lute', perc: 'soft', sections: { I: [[0, 2]], A: [[0, 2], [3, 2], [0, 2], [6, 2]], B: [[2, 2], [3, 2], [4, 2], [0, 2]] } }),
    T({ id: 'town5', ru: 'Вечер у колодца', seed: 5505, key: 65, mode: 'major', tempo: 98, feel: 'calm', melody: 'flute', arp: 'harp', pad: 'strings', padVel: 0.6, perc: 'soft', sections: { I: [[0, 2]], A: [[0, 2], [5, 2], [3, 2], [4, 2]], B: [[3, 2], [4, 2], [5, 2], [4, 2]] } }),
    // ------------------------------------------------------------------ the wizards' towns and the tower (5)
    M({ id: 'magic1', ru: 'Башня волшебников', seed: 6101, key: 60, mode: 'lydian', tempo: 82, melody: 'celesta', arp: 'harp', arpPattern: [0, 1, 2, 3, 2, 1, 0, 1], sections: { I: [[0, 2]], A: [[0, 2], [1, 2], [0, 2], [4, 2]], B: [[3, 2], [1, 2], [5, 2], [4, 2]] } }),
    M({ id: 'magic2', ru: 'Свитки и свечи', seed: 6202, key: 63, mode: 'major', tempo: 78, melody: 'flute', arp: 'celesta', sections: { I: [[0, 2]], A: [[0, 2], [5, 2], [3, 2], [4, 2]], B: [[1, 2], [4, 2], [2, 2], [5, 2]] } }),
    M({ id: 'magic3', ru: 'Звёздный двор', seed: 6303, key: 58, mode: 'lydian', tempo: 90, feel: 'lively', melody: 'bell', arp: 'harp', counter: 'flute', sections: { I: [[0, 2]], A: [[0, 2], [1, 2], [4, 2], [0, 2]], B: [[5, 2], [1, 2], [3, 2], [4, 2]] } }),
    M({ id: 'magic4', ru: 'Тихая библиотека', seed: 6404, key: 62, mode: 'dorian', tempo: 76, melody: 'harp', arp: 'celesta', pad: 'strings', sections: { I: [[0, 2]], A: [[0, 2], [3, 2], [6, 2], [0, 2]], B: [[3, 2], [4, 2], [1, 2], [4, 2]] } }),
    M({ id: 'magic5', ru: 'Танец огоньков', seed: 6505, key: 65, mode: 'lydian', tempo: 96, feel: 'lively', melody: 'celesta', arp: 'harp', arpPattern: [0, 2, 1, 3, 0, 2, 1, 3], counter: 'choir', sections: { I: [[0, 2]], A: [[0, 2], [1, 2], [5, 2], [4, 2]], B: [[3, 2], [1, 2], [0, 2], [4, 2]] } }),
];

export const MUSIC_CATS = ['adventure', 'battle', 'cave', 'hell', 'town', 'magic'];
export const tunesOf = (cat) => TUNES.filter((t) => t.cat === cat);
export const tuneById = (id) => TUNES.find((t) => t.id === id) || null;
/** The battle tune for a fight of this intensity (0…1): the nearest, sorted from a skirmish to a boss. */
export function battleTune(intensity) {
    const list = tunesOf('battle');
    let best = list[0], bd = Infinity;
    for (const t of list) { const d = Math.abs(t.intensity - intensity); if (d < bd) { bd = d; best = t; } }
    return best;
}
