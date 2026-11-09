// Real game materials: the Creative river, a book spread and an unrolled spell scroll.
export default async function (h) {
    const g = h.g, T = h.THREE;
    h.time(0.3); h.bare();
    await h.go(0, 8, -28);
    h.cam([8, 5, -23], [0, -0.7, -34]);
    await h.shot('river', { settle: 12 });
    const { makeSpellBookModel, setBookAngle } = await import('/src/game/BookModel.js');
    const { drawTitlePage } = await import('/src/game/BookReading.js');
    const { drawParchment } = await import('/src/game/ScrollReading.js');
    const book = makeSpellBookModel(); book.scale.setScalar(1.6); book.position.set(0, 7, -28);
    setBookAngle(book, 2.6);
    const b = book.userData.book;
    b.faceL.material = new T.MeshBasicMaterial({ map: drawTitlePage('left', ['ProtectionHouse', 'StrengthenHouse']) });
    b.faceR.material = new T.MeshBasicMaterial({ map: drawTitlePage('right', ['ProtectionHouse', 'StrengthenHouse']) });
    g.scene.add(book);
    h.cam([0, 7, -25.6], [0, 7, -28]);
    await h.shot('book', { settle: 4 });
    book.visible = false;
    const scroll = new T.Mesh(new T.PlaneGeometry(2.2, 1.38), new T.MeshBasicMaterial({ map: drawParchment({ kind: 'scroll', stat: 'spell', spell: 'WindMaxima' }), side: T.DoubleSide }));
    scroll.position.copy(book.position); g.scene.add(scroll);
    await h.shot('scroll', { settle: 4 });
    g.scene.remove(book, scroll);
}
