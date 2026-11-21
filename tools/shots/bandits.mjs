// A robber gang on horses (BanditGangs.js): spawn near the hero, let each strategy run, print what they do, take pictures.
// node tools/shot.mjs bandits --args '{"strategy":"circle","n":4,"secs":40}'
export default async function (h, a = {}) {
    const g = h.g;
    h.time(0.5);
    g.combat.enabled = true; g.combat.maxHp = 40; g.combat.hp = 40; // (a hero that can be hurt)
    const me = g.character.group.position;
    await h.go(0, 9, 40);
    await h.frames(120);
    const B = g.bandits;
    const x = me.x + 70, z = me.z;
    const P = B.spawnNear({ at: { x, z }, n: a.n || 4, strategy: a.strategy || 'charge' });
    h.log('spawn', !!P, P && { n: P.n, strategy: P.strategy, roles: P.members.map((v) => v.bandit?.role), titles: P.members.map((v) => v.title + ' ' + v.name) });
    if (!P) return;
    const secs = a.secs || 40;
    let shots = 0;
    for (let t = 0; t < secs; t++) {
        await h.frames(30);
        const ms = P.members.filter((v) => !v.dead);
        const d = ms.map((v) => Math.round(Math.hypot(v.x - me.x, v.z - me.z)));
        h.log(`t=${t}s phase=${P.phase} hp=${g.combat.hp.toFixed(1)} dist=${d.join(',')} modes=${ms.map((v) => v.mode).join(',')} afoot=${ms.filter((v) => !v.seated).length} loot=${P.loot.length}`);
        const near = ms.find((v) => Math.hypot(v.x - me.x, v.z - me.z) < 14);
        if (near && shots < (a.shots || 3) && t % 4 === 0) {
            const q = near.group.position;
            h.cam([q.x + 7, q.y + 4, q.z + 7], [q.x, q.y + 2.5, q.z]);
            await h.shot('bandit-' + (a.strategy || 'charge') + '-' + shots++, { settle: 2 });
            window.__shotCam = null; g.character.group.visible = true;
        }
        if (P.phase === 'leave' && t > 10 || !g.bandits.gangs.has(P.id)) break;
    }
    h.log('end', { phase: P.phase, alive: P.members.filter((v) => !v.dead).length, hp: g.combat.hp });
}
