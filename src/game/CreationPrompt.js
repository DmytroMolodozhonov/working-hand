/**
 * CreationPrompt.js — what the gods (the local Gemma, llm_native.py on the video card) are asked for «Да пусть создастся …»,
 * and how their answer is read. Pure: no THREE, no fetch.
 *
 * The answer is held to a JSON shape by llama.cpp's grammar (CREATION_SCHEMA → `response_format: json_schema`), so it is
 * always JSON of the right fields; what is IN the fields is still only a wish — CreationRules.sanitizeRecipe clamps it
 * and fills its gaps from the words. Short words for the network: it writes a small recipe (~150–500 words), never
 * blocks — the blocks come from CreationBuild.js, the bodies from CreatureForge.js.
 */

import {
    MATERIAL_KEYS, PART_KEYS, STATUE_KEYS, PLAN_KEYS, WALK_KEYS, FLY_KEYS, WING_KINDS, TAIL_KINDS, SKINS, PATTERNS, TEMPERS, DIETS,
    ABILITY_KEYS, FLAW_KEYS, PLANT_FORM_KEYS, CROWNS, LEAVES, FRUITS, HABITAT_KEYS, SPREAD_KEYS, CAPS, EAR_SHAPES, FEET, SNOUTS,
} from './CreationRules.js';
import { SPECIES_KEYS } from './CreatureSpecies.js';

const S = { type: 'string' }, N = { type: 'number' }, I = { type: 'integer' }, B = { type: 'boolean' };
const E = (list) => ({ enum: list });
const COLOR = { type: 'string', maxLength: 7 };

/** The JSON shape of the answer (llama.cpp turns it into a grammar: nothing else can be written). */
export const CREATION_SCHEMA = {
    type: 'object',
    properties: {
        type: E(['build', 'creature', 'plant']),
        name: { type: 'string', maxLength: 40 },
        build: {
            type: 'object',
            properties: {
                style: { type: 'object', properties: { wall: E(MATERIAL_KEYS), roof: E(MATERIAL_KEYS), trim: E(MATERIAL_KEYS), glass: B } },
                parts: {
                    type: 'array', maxItems: 8,
                    items: {
                        type: 'object',
                        properties: {
                            kind: E(PART_KEYS), size: { type: 'array', items: N, minItems: 3, maxItems: 3 }, at: { type: 'array', items: N, minItems: 2, maxItems: 2 },
                            rot: E([0, 1, 2, 3]), floors: I, towers: I, houses: I, count: I, subject: E(STATUE_KEYS),
                            moat: B, walls: B, spires: B, garden: B, water: B, wall: E(MATERIAL_KEYS), roof: E(MATERIAL_KEYS),
                        },
                        required: ['kind', 'size'],
                    },
                },
            },
            required: ['parts'],
        },
        creature: {
            type: 'object',
            properties: {
                species: E(SPECIES_KEYS), plan: E(PLAN_KEYS), size: N, legs: I, legLen: N, legThick: N, neck: N, head: N,
                eyes: { type: 'object', properties: { n: I, size: N, color: COLOR } }, ears: N,
                horns: { type: 'object', properties: { n: I, len: N } }, tail: E(TAIL_KINDS), tailLen: N,
                wings: E(WING_KINDS), wingSpan: N, skin: E(SKINS), colors: { type: 'array', items: COLOR, maxItems: 3 }, pattern: E(PATTERNS), glow: COLOR,
                walk: E(WALK_KEYS), fly: E([...FLY_KEYS, 'none']), swim: B, hp: I, speed: E(['slow', 'normal', 'fast']),
                abilities: { type: 'array', items: E(ABILITY_KEYS), maxItems: 4 }, flaws: { type: 'array', items: E(FLAW_KEYS), maxItems: 3 },
                temper: E(TEMPERS), diet: E(DIETS), habitat: E(HABITAT_KEYS), breed: I, count: I,
                earShape: E(EAR_SHAPES), feet: E(FEET), snout: E(SNOUTS), mane: E(['neck', 'lion', 'none']), antlers: B, tusks: B, hump: I, shell: B, spikes: B, maneColor: COLOR, wingColor: COLOR,
            },
            required: ['plan', 'size', 'walk'],
        },
        plant: {
            type: 'object',
            properties: {
                form: E(PLANT_FORM_KEYS), height: N, trunk: { type: 'object', properties: { color: COLOR, thick: N, twist: N } },
                crown: E(CROWNS), leaves: E(LEAVES), leafColor: COLOR, flowers: { type: 'object', properties: { color: COLOR, count: I } },
                fruit: E(FRUITS), fruitColor: COLOR, glow: COLOR, glowOn: E(['all', 'leaves', 'flowers', 'fruit']), spread: E(SPREAD_KEYS), habitat: { type: 'array', items: E(HABITAT_KEYS), maxItems: 3 },
                grow: E(['slow', 'normal', 'fast']), count: I,
            },
            required: ['form', 'height'],
        },
    },
    required: ['type', 'name'],
};

/** The system turn (read once and kept by the program). */
export const CREATION_SYSTEM = `Ты — боги мира волшебной игры. Игрок сказал заклинание «Да пусть создастся …» и описал, что создать. Преврати описание в РЕЦЕПТ — один JSON-объект.
Мерки мира: блок = 1 м; герой ростом 3,5 м; дверь 3×6 м; этаж 7 м; дом обычно 14×11 м, высота 11; замок 50–80 м; город до 120 м; башня 8–12 м шириной и 20–40 м высотой.
Поле "type": "build" — постройка или неживая вещь (дом, замок, город, башня, мост, колодец, фонтан, СТАТУЯ кого угодно, корабль, пирамида, храм…); "creature" — живое существо; "plant" — растение.
Поле count — сколько: одно существо/растение — 1; «пара» — 2; «несколько» — 3–5; «стая, группа, рощица» — 6–12; «много» — 15–30; «лес, поле, стадо, рой» — 40–80 (существ не больше 12). Цвета из слов — обязательно в colors / leafColor / flowers.color (#rrggbb); рост — в size / height в метрах (герой 3,5 м; «очень большое» — в 2–3 раза больше обычного).
Если в описании есть слова «существо», «животное», «зверь», «монстр» или приметы тела (шерсть, лапы, глаза, крылья, хвост, рога, усы) — это "creature", даже без названия зверя. «Растение», «дерево», «цветок», «куст», «гриб» — "plant".
"name": короткое имя по-русски (2–4 слова). Заполни ТОЛЬКО секцию своего типа ("build", "creature" или "plant").
build.parts — части (до 8): kind из списка, size = [ширина, глубина, высота] в метрах, at = [x, y] — место центра части в метрах от центра постройки (y вперёд к игроку отрицательный), floors — этажи, towers — башни замка, houses — дома города, subject — кого изображает статуя, moat — ров, walls — стены вокруг, spires — шпили. Город и замок — ОДНА часть ("city"/"castle"), их дома и башни игра расставит сама.
Материалы (wall, roof, trim) — только из списка: stone (серый камень), dark (тёмный камень), white (белый, мрамор), sand (песчаник), brick (кирпич), cobble (булыжник), mossy (замшелый), plaster (штукатурка), planks, darkplanks, logs (брёвна), gold, arcane (волшебный камень), arcanedark, redroof, blueroof, slateroof, purpleroof, thatch (солома), snow.
creature: species — на какое животное похоже (ключ из списка: horse конь, cow корова, deer олень, giraffe жираф, elephant слон, camel верблюд, dog собака, wolf волк, fox лиса, cat кошка, lion лев, tiger тигр, bear медведь, rabbit кролик, monkey обезьяна, turtle черепаха, crocodile крокодил, dinosaur динозавр, frog лягушка, eagle орёл, owl сова, dragon дракон, griffin грифон, unicorn единорог, pegasus пегас и др.; если не похоже ни на кого — не пиши); plan — скелет (quadruped, biped, bird, insect, spider, serpent, fish, blob, dragon); size — рост в метрах (0.3–14); legs — число ног; legLen/legThick/neck/head — пропорции (1 = обычно, 0.5 = тонкие/короткие, 1.6 = длинные/большие); eyes.size 1 обычные, 2 большие; wings — none/feather/bat/insect/dragon/butterfly; walk — ОДИН из 10 способов ходьбы: trot, gallop, stride, hop, waddle, scuttle, slither, crawl, roll, bounce; fly — ОДИН из 10 способов полёта (flap, soar, hover, flutter, bat, dragon, float, pulse, swoop, spin) или "none", если не летает; hp — здоровье: ${CAPS.HP_DEFAULT}, если игрок не назвал число; abilities — только из списка: fireBreath, waterSpit, iceBreath, poison, lightning, glow, invisible, heal, teleport, sing; flaws — slow, blind, fragile, clumsy, timid, hatesWater, sleepy, loud; temper — friendly, neutral, shy, hostile; colors — до трёх цветов "#rrggbb".
plant: form (tree, bush, flower, grass, vine, mushroom, cactus, reed, crystal), height в метрах, crown, leaves, цвета "#rrggbb", fruit, glow (если светится) и glowOn — что светится (all, leaves, flowers, fruit), spread — как часто распространяется (never, rare, normal, often), habitat — где растёт (meadow, forest, mountain, water, desert, snow, swamp, cave, any), grow — скорость роста.
Следуй описанию игрока как можно точнее: каждое названное свойство должно попасть в рецепт. Не придумывай лишнего. Ответ — только JSON.`;

/** The user's turn: the description as said. */
export function creationUser(desc) {
    return `Описание игрока: «${String(desc ?? '').slice(0, 600)}»`;
}

/** A second try after a broken first answer: what was wrong. */
export function creationRetry(desc, why) {
    return `${creationUser(desc)}\nПрошлый ответ не подошёл (${why}). Напиши рецепт заново — только JSON по схеме.`;
}

/**
 * The network's answer → an object (null: no JSON in it). Tolerant: text round it, ```json fences, a cut-off end
 * (the braces closed as far as they were opened).
 */
export function parseAnswer(text) {
    let s = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
    const i = s.indexOf('{');
    if (i < 0) return null;
    s = s.slice(i);
    try { return JSON.parse(s); } catch (e) { /* (a tail after it, or cut off) */ }
    // the first balanced object
    let depth = 0, str = false, esc = false;
    for (let k = 0; k < s.length; k++) {
        const c = s[k];
        if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
        if (c === '"') str = true;
        else if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(0, k + 1)); } catch (e) { return null; } } }
    }
    // cut off: close what is open (a string first), drop a dangling key or comma
    const stack = [];
    str = false; esc = false;
    for (let k = 0; k < s.length; k++) {
        const c = s[k];
        if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
        if (c === '"') str = true; else if (c === '{') stack.push('}'); else if (c === '[') stack.push(']'); else if (c === '}' || c === ']') stack.pop();
    }
    let t = s + (str ? '"' : '');
    t = t.replace(/,\s*$/, '').replace(/,\s*"[^"]*"\s*:?\s*$/, '').replace(/:\s*$/, ': null');
    t += stack.reverse().join('');
    try { return JSON.parse(t); } catch (e) { return null; }
}

/** Is the parsed answer worth using (it says what it makes)? Why not, or null. */
export function answerProblem(obj) {
    if (!obj || typeof obj !== 'object') return 'нет JSON';
    if (!['build', 'creature', 'plant'].includes(obj.type)) return 'нет поля type';
    const sec = obj[obj.type];
    if (!sec || typeof sec !== 'object') return `нет секции ${obj.type}`;
    if (obj.type === 'build' && !(Array.isArray(sec.parts) && sec.parts.length)) return 'нет частей постройки';
    return null;
}
