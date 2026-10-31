/**
 * WindImpulse.js — «Wind Impulse» / «Wind Impulse Maxima» (only from a scroll — one scroll teaches both).
 *
 * The wand is raised UP (or turned at oneself — WandAim.js) and the words are said: a ring of air
 * bursts out of the caster in every direction — no ball, no ray. Whoever and whatever is within
 * 3 m (Maxima: 9 m) is pushed straight away from the caster, the nearest the hardest. Never hurts
 * by itself (a fall from a ledge does, as after any push). Mana: 10 / 40.
 *
 * Who decides (the network): the spell goes to everybody as a 'spell' message; the host pushes the
 * creatures and the things lying about, every computer pushes its own player.
 */

import * as THREE from 'three';

export const IMPULSE = {
    // (strong enough to throw a knight in plain armour — 1.4 times a person's weight — off his feet
    //  at the very edge: the author «рыцари не отлетели вообще»; SPELL_PHYSICS also says it always knocks down)
    WindImpulse: { r: 3, push: 22, up: 4 },
    WindImpulseMaxima: { r: 9, push: 34, up: 6 },
    /** a book-bird this near is knocked out of the air (a light book in a gust) */
    BIRD_K: 1,
    /** loose things fly this much faster than bodies are pushed (they are light) */
    THING_K: 0.7,
};

export const isImpulse = (name) => name === 'WindImpulse' || name === 'WindImpulseMaxima';

/**
 * The push at `pos` from an impulse at `origin` (null: out of reach): straight away from the
 * caster along the ground and a little up; full at the caster, a third at the edge.
 */
export function impulsePush(name, origin, pos, out = new THREE.Vector3()) {
    const P = IMPULSE[name];
    if (!P) return null;
    out.set(pos.x - origin.x, 0, pos.z - origin.z);
    const d = out.length();
    // (measured along the ground — a big body's middle stands high; the wave reaches as far up and down as out)
    if (d > P.r || Math.abs(pos.y - origin.y) > P.r + 2) return null;
    if (d < 1e-3) out.set(1, 0, 0); else out.divideScalar(d);
    const k = P.push * (1 - 0.5 * d / P.r);
    return out.multiplyScalar(k).setY(P.up * (1 - 0.4 * d / P.r));
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). `does`: push | knock | none; `why` in words.
 * Who decides: the host — creatures and loose things; each computer — its own player.
 */
export const IMPULSE_TARGETS = {
    me: { does: 'none', why: 'сам колдующий стоит в центре волны — его не толкает' },
    players: { does: 'push', why: 'других игроков в радиусе отталкивает от колдующего (каждый компьютер толкает своего игрока); поднятый к волне щит «Protection» или купол держит её, сфера дома — тоже' },
    zombies: { does: 'push', why: 'отлетают от колдующего и падают (CreatureImpact: всегда сбивает с ног, подбрасывает)' },
    castlePeople: { does: 'push', why: 'жители, рыцари (и в обычных доспехах), король, волшебники — отлетают и падают (CreatureImpact, всегда с ног); волшебника Мастера защищает его купол' },
    animals: { does: 'push', why: 'тяжёлую корову толкает слабее, овцу и свинью — сильнее (масса CreatureImpact)' },
    sailors: { does: 'push', why: 'моряков на палубе толкает по палубе (в координатах корабля), у борта — за борт' },
    spider: { does: 'none', why: 'гигантская паучиха слишком тяжёлая и держится всеми лапами — волна только обдаёт её' },
    livingTrees: { does: 'push', why: 'живое дерево качнётся (масса 3.5), корни держат — почти не сдвигается' },
    bookBirds: { does: 'knock', why: 'лёгкую книгу-птицу в радиусе сбивает на землю (книга защиты — нет: её сбивают только огонь и лёд)' },
    dragon: { does: 'push', why: 'дракон только качнётся (Dragons.push) — сдуть великана нельзя' },
    iceCastle: { does: 'push', why: 'снеговика сдувает; королева и ледяные монстры только качаются (CreatureImpact: «I»)' },
    blackship: { does: 'push', why: 'капитан и скелеты держатся на палубе (Sailors.BRACE): встают в стойку, сдвигает максимум на полметра, ни с ног, ни за борт; паруса чёрного корабля чужой ветер не наполняет' },
    phoenix: { does: 'push', why: 'лёгкую птицу отбрасывает далеко (масса 0.4), без урона' },
    owl: { does: 'push', why: 'со свитка: сову отбрасывает волной воздуха, без урона; она улетает обиженной (Owls.TARGETS)' },
    canary: { does: 'push', why: 'канарик тяжёл: волна воздуха сдвигает его на шаг-два, роняет с некоторой вероятностью (CreatureImpact, тело «рыцарь»); лагерь сердится' },
    taron: { does: 'none', why: 'Тарон слишком тяжёл (устойчивость 85): волна воздуха его не двигает; лагерь сердится на колдующего (Taron.hit)' },
    spencer: { does: 'none', why: 'птичку Спенсера волна воздуха не берёт: она вспархивает и улетает, не пострадав (SpencerRules: ветер лишь вспугивает)' },
    ghost: { does: 'none', why: 'не действует: призрак бестелесный — волна воздуха проходит сквозь него (сдувает призраков только «Wind» и «Wind Maxima»)' },
    custom: { does: 'push', why: 'созданное существо волна воздуха отбрасывает, как зверя его размера (CreatureImpact «C»); больше 6 м — только сдвигает' },
    gargoyle: { does: 'push', why: 'со свитка: горгулью отбрасывает волной воздуха (устойчивость 20–30), без урона' },
    servants: { does: 'push', why: 'свои слуги («Брейнрот», живое дерево) — толкает так же, как всех: волна не выбирает' },
    looseThings: { does: 'push', why: 'оружие и вещи на земле разлетаются от колдующего (их физика)' },
    heldThings: { does: 'none', why: 'вещь в чужой руке не вырывает — держат пальцы' },
    doors: { does: 'push', why: 'двери в радиусе распахиваются от колдующего (Doors.blow — сила заклинания, как от «Вайнд»); запертая только дрогнет' },
    ships: { does: 'none', why: 'корпус корабля не сдвинуть; в паруса волна не дует — она короткая (3/9 м) и во все стороны' },
    world: { does: 'none', why: 'стены, деревья, земля, вода — не ломает: это только воздух' },
};
