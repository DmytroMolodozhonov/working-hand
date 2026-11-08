// The fishermen's pier of the Creative test ground and fishing: the pier (land side, from the water), the rack with the free rods, a rod in the hand, the float on the water,
// a bite, a fight (the rod bent), the catch on the deck.   node tools/shot.mjs fishing
export default async function (h) {
    const g = h.g, THREE = h.THREE;
    await h.frames(20);
    h.time(0.3); h.bare();
    const a = g.fishPier.arrival();
    h.log('arrival', JSON.stringify(a));
    await h.go(a.x, 25, a.z);
    const ok = await h.until(() => g.fishPier.plan && g.fishPier._built(), 120000);
    h.log('built', ok, g.fishPier.plan && JSON.stringify({ zL: g.fishPier.plan.zL, D: g.fishPier.plan.D, zE: g.fishPier.plan.zE, rect: g.fishPier.plan.rect }), g.fishPier.why);
    if (!g.fishPier.plan) return;
    const P = g.fishPier.plan, xc = a.x;
    await h.frames(40);
    const stand = (x, y, z) => { g.character.group.position.set(x, y + 2.1, z); g.character.verticalVelocity = 0; g.faceYaw?.(0); };
    stand(P.stand.x, P.stand.y, P.stand.z);
    await h.frames(30);
    h.cam([xc + 11, P.D + 6, P.zL + 11], [xc - 1, P.D + 1, P.zL - 8]);
    await h.frames(8); await h.shot('pier-landing', { settle: 2 });
    h.cam([xc + 20, P.D + 12, P.zE + 24], [xc, P.D, P.zE + 6]);
    await h.frames(8); await h.shot('pier-wide', { settle: 2 });
    h.cam([xc - 8, P.D + 4.2, P.zL - 3], [xc - 3, P.D + 3.0, P.zL - 3]);
    await h.frames(8); await h.shot('rack', { settle: 2 });
    h.log('rods on the rack', [...g.items.loose.values()].filter((L) => L.item.kind === 'fishingRod').length);
    // take a rod from the rack
    const L = [...g.items.loose.values()].find((l) => l.item.kind === 'fishingRod');
    if (!L) return;
    g.items.removeLoose(L.item.uid);
    g.items.takeIntoHand(L.item, 'right', { closed: true });
    await h.frames(20);
    h.log('held', !!g.items.heldOf('fishingRod'));
    // out to the head of the pier
    stand(P.head.x, P.head.y, P.head.z + 1);
    await h.frames(30);
    const F = g.fishing;
    h.cam([xc + 7, P.D + 5, P.zE + 12], [xc, P.D + 3, P.zE - 4]);
    await h.frames(5); await h.shot('rod-in-hand', { settle: 2 });
    // a cast
    F._launch({ x: 0, y: 7, z: -15, speed: 17 });
    await h.until(() => F.state === 'float' || F.state === 'ground', 8000);
    h.log('cast →', F.state, 'water', JSON.stringify(F.water), 'b', F.b.toArray().map((v) => +v.toFixed(1)));
    h.cam([xc + 8, P.D + 6, P.zE + 8], [F.b.x, F.b.y, F.b.z]);
    await h.frames(40); await h.shot('float', { settle: 2 });
    // a bite
    F.wait = 0;
    await h.frames(70);
    h.log('state', F.state, F.bite && F.bite.phase);
    await h.shot('bite', { settle: 1 });
    await h.frames(14);
    // the hook is set: a fight
    if (F.state === 'bite') { F.bite.phase = 'dip'; F._hook(); }
    F.tension = 0.8;
    await h.frames(25);
    h.cam([xc + 6, P.D + 5, P.zE + 6], [F.b.x, F.b.y + 2, F.b.z]);
    await h.frames(4); await h.shot('fight', { settle: 1 });
    h.log('fight state', F.state, F.fight && JSON.stringify({ line: F.fight.line, st: F.fight.stamina }));
    // the catch
    if (F.fight) { F.fight.stamina = 0.05; F.fight.line = 3; }
    await h.until(() => F.log.includes('back') || F.state === 'back', 6000);
    await h.frames(30);
    h.cam([xc + 4, P.D + 6, P.zE + 6], [xc, P.D + 1, P.zE + 1]);
    await h.frames(25); await h.shot('catch', { settle: 1 });
    h.log('log', F.log.slice(-14).join(','), 'caught', F.caught, 'fish items', [...g.items.loose.values()].filter((l) => l.item.kind === 'fish').length);
}
