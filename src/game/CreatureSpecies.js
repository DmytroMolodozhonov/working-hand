/**
 * CreatureSpecies.js — the kinds of beasts a creature of one's own may be LIKE («Да пусть создастся существо, похожее на коня»).
 *
 * The author: «все существа получаются однотипными… похожи на кошечек… должна быть более умная система, в разы умнее —
 * и по размеру, и по всем параметрам». So a skeleton (CreationRules.PLANS) is only the start: each kind here brings its
 * real build — a horse's long legs, deep chest, long raised neck and long muzzle, mane, hooves and a hair tail; an
 * elephant's columns of legs, trunk, fan ears and tusks; a giraffe's neck; a deer's antlers; a camel's hump; a
 * turtle's shell; a lion's mane; a tiger's stripes… — its natural size in the world's measures (the hero is 3.5 m: ×1.9
 * of life), its colours, its gait. The words still win over all of it (CreationRules.guessCreature): «огромный белый
 * конь с чёрной гривой и крыльями» is this horse, white, with a black mane, huge, winged.
 *
 * Fields (all but `ru`, `plan`, `h` may be left out — the skeleton's own then):
 *   h        natural height to the top of the head, m (world measures)
 *   body     {len, deep, wide} — the trunk's proportions against the skeleton's (1 = as it is)
 *   legLen, legThick, neck, head, ears (size), neckUp (rad: how high the neck is carried)
 *   snout    {len, kind: 'muzzle' | 'flat' | 'beak' | 'trunk' | 'long' | 'none'}
 *   earShape 'pointy' | 'round' | 'long' | 'floppy' | 'fan' | 'none'
 *   feet     'hoof' | 'paw' | 'claw' | 'webbed' | 'pad'
 *   mane     'neck' | 'lion' | null;  antlers, tusks, shell, spikes (along the back), whiskers: true; hump: 1 | 2
 *   tail, tailLen, skin, pattern, walk, speed, wings, fly, horns {n, len}, legs
 *   colors   [[body, second (belly / pattern), accent (mane, hooves, horns)], …] — one taken by the creature's seed
 */

/** @type {Record<string, object>} */
export const SPECIES = {
    horse: { ru: /кон[яеюь]?(?![а-яё])|кони(?![а-яё])|лошад|жереб|скакун|рысак|кобыл/, plan: 'quadruped', h: 4.2, body: { len: 1.35, deep: 1.1, wide: 0.85 }, legLen: 1.55, legThick: 0.8, neck: 2.2, neckUp: 1.0, head: 0.95,
        snout: { len: 1.7, kind: 'muzzle' }, earShape: 'pointy', ears: 0.7, feet: 'hoof', mane: 'neck', tail: 'hair', tailLen: 1.3, skin: 'fur', walk: 'gallop', speed: 'fast',
        colors: [[0x6b4226, 0x8a5a33, 0x1e1410], [0x2a2420, 0x3a322c, 0x121010], [0xe8e2d8, 0xd8d0c4, 0xb8b0a4], [0x9a9a96, 0xcfcfcb, 0x3a3a3a], [0xb0703a, 0xe0c090, 0xf0e8d8]] },
    pony: { ru: /пони/, plan: 'quadruped', h: 2.6, body: { len: 1.2, deep: 1.15, wide: 1 }, legLen: 1.1, legThick: 1, neck: 1.6, neckUp: 0.95, head: 1.05, snout: { len: 1.3, kind: 'muzzle' }, earShape: 'pointy', ears: 0.8, feet: 'hoof', mane: 'neck', tail: 'hair', skin: 'fur', walk: 'trot',
        colors: [[0xd8c0a0, 0xf0e4d0, 0x6a4a2a], [0x7a5a3a, 0xa08060, 0x2a1a10]] },
    unicorn: { ru: /единорог/, plan: 'quadruped', h: 4.3, body: { len: 1.3, deep: 1.05, wide: 0.82 }, legLen: 1.6, legThick: 0.75, neck: 2.2, neckUp: 1.05, head: 0.95, snout: { len: 1.6, kind: 'muzzle' }, earShape: 'pointy', ears: 0.7, feet: 'hoof', mane: 'neck', tail: 'hair', tailLen: 1.4,
        horns: { n: 1, len: 2.2 }, skin: 'fur', walk: 'gallop', speed: 'fast', colors: [[0xf4f0f6, 0xfff8ff, 0xe8b8f0], [0xf6f2ea, 0xffffff, 0xf0d070]] },
    pegasus: { ru: /пегас/, plan: 'quadruped', h: 4.3, body: { len: 1.3, deep: 1.05, wide: 0.82 }, legLen: 1.55, legThick: 0.75, neck: 2.2, neckUp: 1.0, head: 0.95, snout: { len: 1.6, kind: 'muzzle' }, earShape: 'pointy', ears: 0.7, feet: 'hoof', mane: 'neck', tail: 'hair', tailLen: 1.3,
        wings: 'feather', fly: 'soar', skin: 'fur', walk: 'gallop', speed: 'fast', colors: [[0xf4f2ee, 0xffffff, 0xc8d8f0]] },
    zebra: { ru: /зебр/, plan: 'quadruped', h: 3.6, body: { len: 1.3, deep: 1.1, wide: 0.85 }, legLen: 1.45, legThick: 0.8, neck: 2, neckUp: 0.95, snout: { len: 1.5, kind: 'muzzle' }, earShape: 'round', ears: 0.9, feet: 'hoof', mane: 'neck', tail: 'tuft', skin: 'fur', pattern: 'stripes', walk: 'gallop',
        colors: [[0xf2f0ea, 0xf2f0ea, 0x161414]] },
    donkey: { ru: /осел|осла|ослик|мул/, plan: 'quadruped', h: 3.2, body: { len: 1.2, deep: 1.1, wide: 0.9 }, legLen: 1.2, neck: 1.5, neckUp: 0.8, snout: { len: 1.4, kind: 'muzzle' }, earShape: 'long', ears: 1.7, feet: 'hoof', mane: 'neck', tail: 'tuft', skin: 'fur', walk: 'trot',
        colors: [[0x8a8278, 0xd8d0c4, 0x2a2622]] },
    cow: { ru: /коров|бык|теленок|теля|бизон|буйвол|як(?![а-яё])/, plan: 'quadruped', h: 3.4, body: { len: 1.4, deep: 1.3, wide: 1.2 }, legLen: 1.05, legThick: 1.15, neck: 0.8, neckUp: 0.45, head: 1.1, snout: { len: 1.2, kind: 'muzzle' }, earShape: 'round', ears: 0.9, feet: 'hoof',
        horns: { n: 2, len: 1 }, tail: 'tuft', tailLen: 1.2, skin: 'fur', pattern: 'patches', walk: 'trot', speed: 'slow', colors: [[0xf0ece4, 0x1e1a18, 0x2a2420], [0x7a4a26, 0xd8c0a0, 0x2a1a10]] },
    deer: { ru: /олен|лось|лос[ея]|косул|лан[ья]|северн\S* олен/, plan: 'quadruped', h: 4, body: { len: 1.25, deep: 1, wide: 0.8 }, legLen: 1.7, legThick: 0.6, neck: 1.8, neckUp: 1.0, head: 0.9, snout: { len: 1.3, kind: 'muzzle' }, earShape: 'pointy', ears: 1.1, feet: 'hoof',
        antlers: true, tail: 'stub', skin: 'fur', pattern: 'spots', walk: 'gallop', speed: 'fast', colors: [[0x9a6a3e, 0xe8d8c0, 0x4a3420]] },
    giraffe: { ru: /жираф/, plan: 'quadruped', h: 9, body: { len: 1.05, deep: 1, wide: 0.8 }, legLen: 2.1, legThick: 0.6, neck: 2.5, neckUp: 1.3, head: 0.6, snout: { len: 1.4, kind: 'muzzle' }, earShape: 'pointy', ears: 0.8, feet: 'hoof',
        horns: { n: 2, len: 0.6 }, mane: 'neck', tail: 'tuft', skin: 'fur', pattern: 'patches', walk: 'stride', colors: [[0xe8b860, 0x8a4a1e, 0x4a2a10]] },
    elephant: { ru: /слон|мамонт/, plan: 'quadruped', h: 6, body: { len: 1.3, deep: 1.45, wide: 1.35 }, legLen: 1.15, legThick: 2, neck: 0.2, neckUp: 0.3, head: 1.5, snout: { len: 2.6, kind: 'trunk' }, earShape: 'fan', ears: 2.2, feet: 'pad',
        tusks: true, tail: 'tuft', tailLen: 0.8, skin: 'smooth', walk: 'stride', speed: 'slow', colors: [[0x8a8a88, 0xa8a8a4, 0xf2ead8], [0x6a5040, 0x8a6a50, 0xf2ead8]] },
    rhino: { ru: /носорог/, plan: 'quadruped', h: 3.6, body: { len: 1.35, deep: 1.35, wide: 1.3 }, legLen: 0.9, legThick: 1.8, neck: 0.3, neckUp: 0.2, head: 1.3, snout: { len: 1.3, kind: 'long' }, earShape: 'round', ears: 0.7, feet: 'pad',
        horns: { n: 2, len: 1.5 }, tail: 'tuft', tailLen: 0.6, skin: 'shell', walk: 'trot', colors: [[0x8a8682, 0xa8a49e, 0x5a5652]] },
    hippo: { ru: /бегемот|гиппопотам/, plan: 'quadruped', h: 3, body: { len: 1.45, deep: 1.4, wide: 1.5 }, legLen: 0.6, legThick: 1.9, neck: 0.1, head: 1.6, snout: { len: 1.4, kind: 'flat' }, earShape: 'round', ears: 0.5, feet: 'pad', tail: 'stub', skin: 'smooth', walk: 'waddle', swim: true,
        colors: [[0x7a6a72, 0xd8a8a8, 0x4a3a40]] },
    camel: { ru: /верблюд|лам[ау](?![а-яё])|альпак/, plan: 'quadruped', h: 4.4, body: { len: 1.2, deep: 1, wide: 0.85 }, legLen: 1.6, legThick: 0.75, neck: 2, neckUp: 0.55, snout: { len: 1.4, kind: 'muzzle' }, earShape: 'round', ears: 0.6, feet: 'pad', hump: 2,
        tail: 'tuft', skin: 'fur', walk: 'stride', colors: [[0xc8a06a, 0xe0c898, 0x7a5a32]] },
    pig: { ru: /свин|поросен|хрюш|кабан|вепр/, plan: 'quadruped', h: 2, body: { len: 1.3, deep: 1.2, wide: 1.25 }, legLen: 0.7, legThick: 1.1, neck: 0.2, head: 1.15, snout: { len: 0.9, kind: 'flat' }, earShape: 'floppy', ears: 1.1, feet: 'hoof', tail: 'curly',
        skin: 'smooth', walk: 'trot', colors: [[0xf0b0b0, 0xf8d0d0, 0xc87a7a], [0x4a3a2e, 0x6a5444, 0x2a1e16]] },
    sheep: { ru: /овц|овеч|баран|ягнен|ягн[яе]/, plan: 'quadruped', h: 2.3, body: { len: 1.2, deep: 1.35, wide: 1.4 }, legLen: 0.8, legThick: 0.7, neck: 0.5, neckUp: 0.7, head: 0.9, snout: { len: 0.9, kind: 'muzzle' }, earShape: 'floppy', ears: 0.9, feet: 'hoof', tail: 'stub',
        skin: 'fur', walk: 'trot', colors: [[0xf2eee2, 0xe8e0cc, 0x2a2622]] },
    goat: { ru: /коз[аыуле]|козел|козл/, plan: 'quadruped', h: 2.4, body: { len: 1.1, deep: 1, wide: 0.9 }, legLen: 1, neck: 0.9, neckUp: 0.9, snout: { len: 1, kind: 'muzzle' }, earShape: 'floppy', ears: 0.9, feet: 'hoof', horns: { n: 2, len: 1.4 }, tail: 'stub',
        skin: 'fur', walk: 'hop', colors: [[0xe8e0d0, 0xf4f0e8, 0x4a3a2a], [0x6a4a2e, 0x9a7a5a, 0x2a1a10]] },
    dog: { ru: /собак|пес(?![а-яё])|пса|псом|щен|пёс|овчарк|хаск|бульдог|пудел/, plan: 'quadruped', h: 2.2, body: { len: 1.15, deep: 1.05, wide: 0.85 }, legLen: 1.05, legThick: 0.85, neck: 0.8, neckUp: 0.8, head: 1, snout: { len: 1.15, kind: 'muzzle' }, earShape: 'floppy', ears: 1,
        feet: 'paw', tail: 'thin', tailLen: 0.9, skin: 'fur', walk: 'gallop', colors: [[0xb07a40, 0xe8d0a8, 0x2a1a10], [0x2a2420, 0xb88a5a, 0x1a1410], [0xe8e0d0, 0xf6f2ea, 0x3a2a1a]] },
    wolf: { ru: /волк|волч|оборот/, plan: 'quadruped', h: 2.6, body: { len: 1.2, deep: 1.05, wide: 0.85 }, legLen: 1.2, legThick: 0.85, neck: 0.8, neckUp: 0.75, head: 1, snout: { len: 1.35, kind: 'muzzle' }, earShape: 'pointy', ears: 1.2, feet: 'paw',
        tail: 'bushy', tailLen: 1.1, skin: 'fur', walk: 'gallop', speed: 'fast', colors: [[0x6e6e72, 0xd8d6d0, 0x2a2a2e], [0x4a4038, 0xb8a890, 0x1e1a16]] },
    fox: { ru: /лис[аыуеi]|лисиц|лисен/, plan: 'quadruped', h: 1.6, body: { len: 1.25, deep: 0.9, wide: 0.8 }, legLen: 0.9, legThick: 0.6, neck: 0.6, neckUp: 0.75, head: 1, snout: { len: 1.4, kind: 'muzzle' }, earShape: 'pointy', ears: 1.5, feet: 'paw',
        tail: 'bushy', tailLen: 1.6, skin: 'fur', walk: 'trot', colors: [[0xd8682a, 0xf6eee0, 0x1e1410]] },
    cat: { ru: /кошк|кошеч|кот(?![а-яё])|кота|котен|котик|кис[аке]/, plan: 'quadruped', h: 1.3, body: { len: 1.1, deep: 0.9, wide: 0.8 }, legLen: 0.95, legThick: 0.6, neck: 0.5, neckUp: 0.7, head: 1.1, snout: { len: 0.5, kind: 'flat' }, earShape: 'pointy', ears: 1.2,
        feet: 'paw', whiskers: true, tail: 'thin', tailLen: 1.3, skin: 'fur', walk: 'trot', colors: [[0x7a7a7a, 0xd8d8d8, 0x2a2a2a], [0xd08a3a, 0xf2e2c4, 0x5a2e10], [0x1e1e22, 0x2e2e32, 0x101012]] },
    lion: { ru: /лев(?![а-яё])|льв|львиц/, plan: 'quadruped', h: 3.2, body: { len: 1.3, deep: 1.1, wide: 0.95 }, legLen: 1.05, legThick: 1.1, neck: 0.6, neckUp: 0.7, head: 1.25, snout: { len: 0.9, kind: 'flat' }, earShape: 'round', ears: 0.7, feet: 'paw',
        mane: 'lion', whiskers: true, tail: 'tuft', tailLen: 1.2, skin: 'fur', walk: 'stride', colors: [[0xd8a05a, 0xf0d8a8, 0x7a4a1e]] },
    tiger: { ru: /тигр|ягуар|леопард|гепард|рыс[ья]|пантер/, plan: 'quadruped', h: 3, body: { len: 1.35, deep: 1, wide: 0.9 }, legLen: 1, legThick: 1, neck: 0.6, neckUp: 0.65, head: 1.15, snout: { len: 0.85, kind: 'flat' }, earShape: 'round', ears: 0.7, feet: 'paw',
        whiskers: true, tail: 'thin', tailLen: 1.4, skin: 'fur', pattern: 'stripes', walk: 'stride', speed: 'fast', colors: [[0xe07a26, 0xf6eee0, 0x161210]] },
    bear: { ru: /медвед|мишк|гризли|панд/, plan: 'quadruped', h: 3.4, body: { len: 1.2, deep: 1.3, wide: 1.3 }, legLen: 0.9, legThick: 1.6, neck: 0.4, neckUp: 0.5, head: 1.2, snout: { len: 0.9, kind: 'muzzle' }, earShape: 'round', ears: 0.8, feet: 'paw',
        tail: 'stub', skin: 'fur', walk: 'waddle', colors: [[0x5a3a22, 0x7a5232, 0x2a1a10], [0xf2f0ea, 0xf6f4ee, 0x1a1a1a]] },
    rabbit: { ru: /кролик|заяц|зайч|зайк/, plan: 'quadruped', h: 1.1, body: { len: 1, deep: 1.1, wide: 0.9 }, legLen: 0.8, neck: 0.3, head: 1.15, snout: { len: 0.5, kind: 'flat' }, earShape: 'long', ears: 2.2, feet: 'paw', whiskers: true, tail: 'stub', skin: 'fur',
        walk: 'hop', colors: [[0xf2eee8, 0xffffff, 0xd8a0a0], [0x9a7a5a, 0xd8c4a8, 0x4a3420], [0x8a8680, 0xd0ccc4, 0x3a3632]] },
    mouse: { ru: /мыш(?:ь|и|ка|ки|ку|онок|ей|ью)(?![а-яё])|крыс|хомяк|мышон/, plan: 'quadruped', h: 0.6, body: { len: 1.2, deep: 1, wide: 0.9 }, legLen: 0.6, neck: 0.2, head: 1.1, snout: { len: 0.8, kind: 'muzzle' }, earShape: 'round', ears: 1.7, feet: 'paw', whiskers: true, tail: 'thin', tailLen: 1.8,
        skin: 'fur', walk: 'scuttle', colors: [[0x8a8680, 0xd8d4cc, 0xe8a0a0]] },
    squirrel: { ru: /белк|бельчон/, plan: 'quadruped', h: 0.9, body: { len: 1.05, deep: 1, wide: 0.85 }, legLen: 0.75, neck: 0.3, head: 1.1, snout: { len: 0.6, kind: 'flat' }, earShape: 'pointy', ears: 1.3, feet: 'paw', tail: 'bushy', tailLen: 2,
        skin: 'fur', walk: 'hop', colors: [[0xc0602a, 0xf2e2c4, 0x5a2a10]] },
    hedgehog: { ru: /еж(?![а-яё])|ежа|ежик|ёж|дикобраз/, plan: 'quadruped', h: 0.8, body: { len: 1.2, deep: 1.1, wide: 1.1 }, legLen: 0.4, neck: 0.1, snout: { len: 0.9, kind: 'muzzle' }, earShape: 'round', ears: 0.6, feet: 'paw', spikes: true, tail: 'none',
        skin: 'fur', walk: 'scuttle', speed: 'slow', colors: [[0x5a4a3a, 0xc8b8a0, 0x2a2018]] },
    monkey: { ru: /обезьян|мартышк|шимпанз|орангутан/, plan: 'biped', h: 2.4, body: { len: 1, deep: 1, wide: 0.95 }, legLen: 0.8, neck: 0.3, head: 1.1, snout: { len: 0.5, kind: 'flat' }, earShape: 'round', ears: 1, feet: 'paw', tail: 'thin', tailLen: 1.5,
        skin: 'fur', walk: 'hop', colors: [[0x6a4a2e, 0xd8b890, 0x2a1a10]] },
    gorilla: { ru: /горилл|йети|снежн\S* человек|бигфут/, plan: 'biped', h: 4.2, body: { len: 1.1, deep: 1.25, wide: 1.4 }, legLen: 0.75, legThick: 1.6, neck: 0.1, head: 1.1, snout: { len: 0.6, kind: 'flat' }, earShape: 'round', ears: 0.6, feet: 'paw', tail: 'none',
        skin: 'fur', walk: 'stride', colors: [[0x2a2a2e, 0x4a4a4e, 0x1a1a1c], [0xf2f2f2, 0xd8e0e8, 0x6a7a8a]] },
    kangaroo: { ru: /кенгуру/, plan: 'biped', h: 3.2, body: { len: 1, deep: 1.1, wide: 0.9 }, legLen: 1.2, legThick: 1.2, neck: 0.6, head: 0.9, snout: { len: 1, kind: 'muzzle' }, earShape: 'long', ears: 1.4, feet: 'paw', tail: 'thin', tailLen: 2,
        skin: 'fur', walk: 'hop', colors: [[0xb07a4a, 0xe8d0b0, 0x4a2a14]] },
    bat: { ru: /летуч\S* мыш|нетопыр|вампир/, plan: 'quadruped', legs: 2, h: 1.2, body: { len: 1, deep: 1, wide: 0.9 }, legLen: 0.5, neck: 0.2, head: 1.1, snout: { len: 0.6, kind: 'flat' }, earShape: 'pointy', ears: 1.8, feet: 'claw', tail: 'none',
        wings: 'bat', fly: 'bat', skin: 'fur', walk: 'crawl', colors: [[0x2a2226, 0x4a3a40, 0x1a1418]] },
    turtle: { ru: /черепах/, plan: 'quadruped', h: 1.6, body: { len: 1.3, deep: 0.8, wide: 1.3 }, legLen: 0.4, legThick: 1.3, neck: 0.9, neckUp: 0.4, head: 0.8, snout: { len: 0.5, kind: 'flat' }, earShape: 'none', feet: 'pad', shell: true, tail: 'stub',
        skin: 'scales', walk: 'crawl', speed: 'slow', swim: true, colors: [[0x6a7a3a, 0x8a6a3a, 0x3a2a14]] },
    crocodile: { ru: /крокодил|аллигатор|кайман/, plan: 'dragon', h: 1.6, body: { len: 1.8, deep: 0.6, wide: 0.9 }, legLen: 0.45, legThick: 1.2, neck: 0.2, neckUp: 0.1, head: 1, snout: { len: 2.6, kind: 'long' }, earShape: 'none', feet: 'claw', spikes: true,
        tail: 'spiky', tailLen: 1.8, skin: 'scales', walk: 'crawl', swim: true, colors: [[0x3e5a2e, 0x9aa870, 0x1e2a14]] },
    lizard: { ru: /ящериц|игуан|геккон|хамелеон|варан/, plan: 'dragon', h: 1.2, body: { len: 1.5, deep: 0.7, wide: 0.8 }, legLen: 0.6, neck: 0.4, neckUp: 0.3, head: 0.9, snout: { len: 1.1, kind: 'long' }, earShape: 'none', feet: 'claw', tail: 'thin', tailLen: 1.8,
        skin: 'scales', walk: 'crawl', colors: [[0x5a9a3a, 0xd0e0a0, 0x2a4a1a], [0xc87a2a, 0xf0d8a0, 0x4a2a10]] },
    dinosaur: { ru: /динозавр|тираннозавр|раптор|ти-рекс|рекс(?![а-яё])/, plan: 'biped', h: 7, body: { len: 1.6, deep: 1.2, wide: 1 }, legLen: 1.2, legThick: 1.6, neck: 0.8, head: 1.6, snout: { len: 1.6, kind: 'long' }, earShape: 'none', feet: 'claw', spikes: true,
        tail: 'thin', tailLen: 2.2, skin: 'scales', walk: 'stride', colors: [[0x5a6a3a, 0xc8c08a, 0x2a3018], [0x7a3a2a, 0xd8a878, 0x2a1410]] },
    frog: { ru: /лягуш|жаб|квакш/, plan: 'quadruped', h: 0.8, body: { len: 1, deep: 0.8, wide: 1.3 }, legLen: 0.9, legThick: 1.2, neck: 0, head: 1.3, snout: { len: 0.3, kind: 'flat' }, earShape: 'none', feet: 'webbed', tail: 'none',
        skin: 'smooth', pattern: 'spots', walk: 'hop', swim: true, colors: [[0x4a9a3a, 0xe0e8a0, 0x1e4a14]] },
    fish: { ru: /рыб|карась|окун|лосос|щук/, plan: 'fish', h: 1.2, skin: 'scales', colors: [[0x6a8ab0, 0xe8eef2, 0xd88a3a], [0xe8782a, 0xf6eee0, 0xffffff]] },
    shark: { ru: /акул/, plan: 'fish', h: 3.4, body: { len: 1.4, deep: 0.8, wide: 0.9 }, snout: { len: 1.3, kind: 'long' }, skin: 'smooth', colors: [[0x6a7a88, 0xf0f2f2, 0x3a4652]] },
    whale: { ru: /кит(?![а-яё])|кита|китом|касатк/, plan: 'fish', h: 6, body: { len: 1.6, deep: 0.9, wide: 1.1 }, head: 1.3, skin: 'smooth', colors: [[0x3a4a5a, 0xd8dee4, 0x1e2630], [0x161618, 0xf4f4f4, 0x161618]] },
    dolphin: { ru: /дельфин/, plan: 'fish', h: 2.4, body: { len: 1.4, deep: 0.8, wide: 0.85 }, snout: { len: 1.2, kind: 'beak' }, skin: 'smooth', colors: [[0x7a8a9a, 0xe8eef2, 0x4a5662]] },
    eagle: { ru: /орел|орл|сокол|ястреб|беркут|гриф(?![а-яё])/, plan: 'bird', h: 1.8, body: { len: 1.1, deep: 1, wide: 0.9 }, legLen: 0.7, neck: 0.6, head: 0.9, snout: { len: 1, kind: 'beak' }, feet: 'claw', tail: 'feather', wings: 'feather', fly: 'soar', wingSpan: 1.6,
        skin: 'feathers', colors: [[0x5a3a22, 0xf2eee6, 0xe8b42a]] },
    owl: { ru: /сов[ауыеоя]?(?![а-яё])|филин|сыч/, plan: 'bird', h: 1.4, body: { len: 0.9, deep: 1.25, wide: 1.1 }, legLen: 0.5, neck: 0.1, head: 1.35, snout: { len: 0.5, kind: 'beak' }, earShape: 'pointy', ears: 0.5, feet: 'claw', tail: 'feather', wings: 'feather', fly: 'flap',
        skin: 'feathers', colors: [[0x8a6a4a, 0xe0d0b0, 0x3a2a1a], [0xf2f2f0, 0xffffff, 0x2a2a2a]] },
    parrot: { ru: /попуга|ара(?![а-яё])|какаду/, plan: 'bird', h: 1.2, body: { len: 0.95, deep: 1.05, wide: 0.85 }, legLen: 0.5, neck: 0.3, head: 1.1, snout: { len: 0.8, kind: 'beak' }, feet: 'claw', tail: 'feather', tailLen: 1.8, wings: 'feather', fly: 'flap',
        skin: 'feathers', colors: [[0x2a9a3a, 0xe8d02a, 0xd8302a], [0xd8302a, 0x2a6ad8, 0xf0d02a]] },
    penguin: { ru: /пингвин/, plan: 'bird', h: 1.6, body: { len: 0.8, deep: 1.5, wide: 1 }, legLen: 0.25, neck: 0.1, head: 0.9, snout: { len: 0.7, kind: 'beak' }, feet: 'webbed', tail: 'none', wings: 'feather', wingSpan: 0.5,
        skin: 'feathers', walk: 'waddle', swim: true, colors: [[0x1e1e24, 0xf6f6f2, 0xf0a02a]] },
    chicken: { ru: /куриц|кур[ау]?(?![а-яё])|петух|цыпл|индюк|утк|гус[ья]|лебед/, plan: 'bird', h: 1.1, body: { len: 1, deep: 1.1, wide: 0.9 }, legLen: 0.7, neck: 0.6, head: 0.8, snout: { len: 0.6, kind: 'beak' }, feet: 'claw', tail: 'feather', wings: 'feather', wingSpan: 0.7,
        skin: 'feathers', walk: 'waddle', colors: [[0xf2eee4, 0xffffff, 0xd8302a], [0xb8602a, 0xe8b860, 0x2a4a1e]] },
    butterfly: { ru: /бабочк|мотыл/, plan: 'insect', h: 0.9, wings: 'butterfly', fly: 'flutter', wingSpan: 1.8, skin: 'smooth', colors: [[0x2a2226, 0xe8782a, 0x2a6ad8], [0x2a2226, 0x6ac8f0, 0xf0d02a]] },
    bee: { ru: /пчел|шмел|ос[аыу](?![а-яё])|оса(?![а-яё])/, plan: 'insect', h: 0.9, wings: 'insect', fly: 'hover', skin: 'fur', pattern: 'rings', colors: [[0xf0c02a, 0x1e1a14, 0xdff4ff]] },
    beetle: { ru: /жук|скараб|божь\S* коровк/, plan: 'insect', h: 0.9, body: { len: 1.1, deep: 0.9, wide: 1.2 }, horns: { n: 1, len: 1.2 }, skin: 'shell', colors: [[0x2a3a5a, 0x1a1a1e, 0x8a9ac8], [0xc8302a, 0x1a1a1e, 0x1a1a1e]] },
    ant: { ru: /муравь/, plan: 'insect', h: 0.7, skin: 'shell', colors: [[0x2a1a14, 0x3a241a, 0x1a100c], [0xa83a1e, 0x7a2a14, 0x3a140a]] },
    spider: { ru: /паук|тарантул|паучих/, plan: 'spider', h: 1.6, skin: 'fur', colors: [[0x2a2226, 0x5a4a40, 0xc8302a]] },
    scorpion: { ru: /скорпион/, plan: 'spider', h: 1.2, body: { len: 1.2, deep: 0.7, wide: 1 }, tail: 'spiky', tailLen: 1.6, skin: 'shell', colors: [[0x3a2a1a, 0x6a4a2a, 0xc8a050]] },
    crab: { ru: /краб|рак(?![а-яё])|омар|лобстер/, plan: 'spider', legs: 8, h: 1.2, body: { len: 0.9, deep: 0.7, wide: 1.4 }, skin: 'shell', colors: [[0xc8402a, 0xe88a6a, 0x5a1a10]] },
    snake: { ru: /змея|змей|змею|змеи|питон|удав|кобр|гадюк|анаконд|червь|червя|гусениц/, plan: 'serpent', h: 1.4, skin: 'scales', pattern: 'patches', colors: [[0x3a6a2a, 0xc8c870, 0x1e2a12], [0x8a6a3a, 0xe0c890, 0x2a1e10], [0x1e1e22, 0xe8c02a, 0xd8302a]] },
    dragon: { ru: /дракон|виверн/, plan: 'dragon', h: 8, body: { len: 1.4, deep: 1.1, wide: 1.05 }, legLen: 1.05, legThick: 1.4, neck: 1.6, neckUp: 0.85, head: 1.1, snout: { len: 1.5, kind: 'long' }, earShape: 'none', feet: 'claw', spikes: true,
        horns: { n: 2, len: 1.6 }, tail: 'spiky', tailLen: 1.6, wings: 'dragon', fly: 'dragon', skin: 'scales', walk: 'crawl', colors: [[0x2e5a2a, 0xc8b878, 0x1e2a14], [0x8a1e1a, 0xe8a85a, 0x2a0a08], [0x1e2a4a, 0x9ab8d8, 0x101828]] },
    griffin: { ru: /грифон|гриффон|гиппогриф/, plan: 'quadruped', h: 4.2, body: { len: 1.3, deep: 1.05, wide: 0.95 }, legLen: 1.15, legThick: 1.1, neck: 1, neckUp: 0.95, head: 1, snout: { len: 1, kind: 'beak' }, earShape: 'pointy', ears: 0.8, feet: 'claw',
        tail: 'tuft', tailLen: 1.2, wings: 'feather', fly: 'soar', wingSpan: 1.5, skin: 'feathers', walk: 'stride', colors: [[0xd8a05a, 0xf2eee6, 0x5a3a22]] },
    golem: { ru: /голем/, plan: 'biped', h: 5.5, body: { len: 1.1, deep: 1.3, wide: 1.5 }, legLen: 0.8, legThick: 1.9, neck: 0, head: 0.8, snout: { len: 0, kind: 'none' }, earShape: 'none', feet: 'pad', tail: 'none', skin: 'stone', walk: 'stride', speed: 'slow',
        colors: [[0x8a8a84, 0xa8a49c, 0x5a5a56]] },
    troll: { ru: /тролл|огр(?![а-яёо])|огра|огры|великан/, plan: 'biped', h: 6, body: { len: 1.1, deep: 1.3, wide: 1.3 }, legLen: 0.85, legThick: 1.7, neck: 0.2, head: 1, snout: { len: 0.8, kind: 'flat' }, earShape: 'pointy', ears: 1.2, feet: 'pad', tail: 'none', skin: 'smooth', walk: 'stride', speed: 'slow',
        colors: [[0x6a7a4a, 0x8a9a6a, 0x3a2a1a]] },
    goblin: { ru: /гоблин|гном|эльф|бес(?![а-яё])|чертен|имп(?![а-яё])/, plan: 'biped', h: 2.2, body: { len: 1, deep: 1, wide: 0.9 }, legLen: 0.9, neck: 0.2, head: 1.3, snout: { len: 0.6, kind: 'flat' }, earShape: 'pointy', ears: 1.8, feet: 'pad', tail: 'none', skin: 'smooth',
        walk: 'stride', colors: [[0x5a8a3a, 0x7aa85a, 0x3a2a1a]] },
    slime: { ru: /слизень|слизн|желе|капл[яи]|сгусток|блоб/, plan: 'blob', h: 1.4, skin: 'slime', colors: [[0x6ad84a, 0xd8ff9a, 0x2a6a1a], [0x4ab8e8, 0xc8f0ff, 0x1a4a6a]] },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

/** Words for a kind (the network names one by its key; a player by its own words): the name in Russian. */
export const SPECIES_RU = {
    horse: 'конь', pony: 'пони', unicorn: 'единорог', pegasus: 'пегас', zebra: 'зебра', donkey: 'осёл', cow: 'корова', deer: 'олень', giraffe: 'жираф', elephant: 'слон', rhino: 'носорог', hippo: 'бегемот',
    camel: 'верблюд', pig: 'свинья', sheep: 'овца', goat: 'коза', dog: 'собака', wolf: 'волк', fox: 'лиса', cat: 'кошка', lion: 'лев', tiger: 'тигр', bear: 'медведь', rabbit: 'кролик', mouse: 'мышь',
    squirrel: 'белка', hedgehog: 'ёж', monkey: 'обезьяна', gorilla: 'горилла', kangaroo: 'кенгуру', bat: 'летучая мышь', turtle: 'черепаха', crocodile: 'крокодил', lizard: 'ящерица', dinosaur: 'динозавр',
    frog: 'лягушка', fish: 'рыба', shark: 'акула', whale: 'кит', dolphin: 'дельфин', eagle: 'орёл', owl: 'сова', parrot: 'попугай', penguin: 'пингвин', chicken: 'курица', butterfly: 'бабочка', bee: 'пчела',
    beetle: 'жук', ant: 'муравей', spider: 'паук', scorpion: 'скорпион', crab: 'краб', snake: 'змея', dragon: 'дракон', griffin: 'грифон', golem: 'голем', troll: 'тролль', goblin: 'гоблин', slime: 'слизень',
};

/**
 * The kind the words mean (the first named: «дракон, похожий на коня» — like a horse; «конь с крыльями дракона» —
 * a horse). A statue's subject is not a creature (CreationRules). @returns {string|null} a SPECIES key
 */
export function speciesOf(s) {
    const t = String(s || '').toLowerCase().replace(/ё/g, 'е');
    // «похож на X / как X / в виде X» — the likeness said straight out wins
    const like = /(?:похож\S*|как|вроде|в виде|в образе|напомина\S*)\s+(?:на\s+)?(\S+(?:\s+\S+)?)/.exec(t);
    if (like) for (const k of SPECIES_KEYS) if (SPECIES[k].ru.test(like[1])) return k;
    let best = null, at = Infinity;
    for (const k of SPECIES_KEYS) {
        const m = SPECIES[k].ru.exec(t);
        if (m && m.index < at) { at = m.index; best = k; }
    }
    return best;
}
