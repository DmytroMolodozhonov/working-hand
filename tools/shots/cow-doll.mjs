// Does a dead cow get a rag doll?   node tools/shot.mjs cow-doll --mode creative
export default async function (h) {
    const g = h.g, A = g.animals, ci = g.creatureImpact;
    await h.frames(150);
    const types = {}; for (const a of A.list) types[a.type] = (types[a.type] || 0) + 1;
    h.log('animals', JSON.stringify(types));
    let cow = A.list.find((a) => a.type === 'cow' && !a.dead);
    if (!cow) { const p = g.character.group.position; cow = A.spawn?.('cow', p.x + 6, p.z + 6); h.log('spawned', !!cow); }
    if (!cow) { h.log('no cow'); return; }
    const tryKill = async (a, how) => {
        const id = 'a|' + a.id;
        if (how === 'die') A._die(a, false, g.localId);
        else if (how === 'cooked') A._die(a, true, g.localId);
        await h.frames(25);
        const ud = a.model.userData;
        h.log(how, 'dead', a.dead, 'doll', ci.deadRags.has(id), 'ragOf', ci.ragOf(a), 'legs', ud.legs?.length, 'neck', !!ud.neck, 'head', !!ud.head, 'rot', a.group.rotation.x.toFixed(2), a.group.rotation.z.toFixed(2), 'fly', a.fly, 'hasDoll type', a.type);
    };
    const cp = cow.group.position, me = g.character.group.position;
    h.log('hero-cow distance', Math.hypot(cp.x - me.x, cp.z - me.z).toFixed(1), 'RAG.NEAR?', ci._ragOk ? 'see ragOk' : '');
    me.set(cp.x + 5, cp.y + 2, cp.z + 5); await h.frames(20);
    h.log('ragOk cow', ci._ragOk('a', Object.assign(cow, { dead: true })), 'rig', !!ci._rig('a', cow)); cow.dead = false;
    await tryKill(cow, 'die');
    const pig = A.list.find((a) => a.type === 'pig' && !a.dead); if (pig) { const pp = pig.group.position; me.set(pp.x + 5, pp.y + 2, pp.z + 5); await h.frames(20); await tryKill(pig, 'die'); }
    const cows = A.list.filter((a) => a.type === 'cow' && !a.dead);
    if (cows[0]) await tryKill(cows[0], 'cooked');
    h.log('done');
}
