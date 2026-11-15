// Diagnostics: does a thrown meat stay in the hand too?   node tools/shot.mjs meat-throw --mode creative
export default async function (h) {
    const T = h.THREE;
    const g = h.g, it = g.items;
    await h.frames(30);
    const count = () => ({ held: ['right', 'left'].map((s) => it.held[s]?.item.kind + '/' + (it.held[s]?.item.count ?? '-')), loose: [...it.loose.values()].filter((L) => L.item.kind === 'meat').map((L) => L.item.uid + ' x' + (L.item.count ?? 1)) });
    for (const [name, mk] of [['one', () => ({ kind: 'meat', uid: 'm1' })], ['stack3', () => ({ kind: 'meat', uid: 'm2', count: 3 })], ['cooked', () => ({ kind: 'steak', uid: 'm3' })]]) {
        const item = mk(); it.takeIntoHand(item, 'right');
        await h.frames(5);
        h.log(name, 'before', JSON.stringify(count()));
        it._throw('right', new T.Vector3(0, 2, -6), { why: 'test' });
        await h.frames(5);
        h.log(name, 'after', JSON.stringify(count()), 'inventory slots', JSON.stringify((g.inventory.slots || []).filter((s) => s && /meat|steak/.test(s.kind)).map((s) => s.uid + 'x' + (s.count ?? 1))));
        await h.frames(60);
        h.log(name, 'later', JSON.stringify(count()));
    }
}
