// Diagnostics: why a stable horse's head world position is NaN.   node tools/shot.mjs horse-nan --mode creative
export default async function (h) {
    const g = h.g;
    await h.frames(40);
    for (const id of ['cH1', 'cH2', 'cPeg']) {
        const a = g.animals.byId.get(id); if (!a) continue;
        const u = a.model.userData, head = u.head, neck = u.neck;
        const chain = []; for (let o = head; o; o = o.parent) chain.push(`${o.name || o.type}[p ${o.position.toArray().map((n) => +n.toFixed(2))} s ${o.scale.toArray().map((n) => +n.toFixed(2))} r ${o.rotation.toArray().slice(0, 3).map((n) => +(+n).toFixed(2))}]`);
        h.log(id, 'neck?', !!neck, 'head?', !!head, 'state', a.state, 'ridden', !!a.rider, 'headP', a.headP, 'headY', a.headY, 'lie', a.lie, 'dead', a.dead);
        h.log(id, 'chain', chain.join(' <- '));
    }
}
