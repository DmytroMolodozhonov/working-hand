export default async function (h) {
    const { g, THREE } = h;
    const { makeItemModel, spellScroll } = await import('/src/game/ItemTypes.js');
    const { drawParchment } = await import('/src/game/ScrollReading.js');
    const spells = ['Fireball', 'WaterVortex', 'LightningStrike', 'GroundVortex', 'AvadaKedavra', 'Nihilis'];
    const display = new THREE.Group();
    display.position.set(0, 45, -5);
    g.scene.add(display);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(10.9, 6.8), new THREE.MeshBasicMaterial({ color: 0x222123 }));
    back.position.z = -0.22;
    display.add(back);
    for (const [i, spell] of spells.entries()) {
        const item = spellScroll(spell);
        const x = (i % 3 - 1) * 3.34, y = i < 3 ? 1.65 : -1.42;
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.13, 1.956), new THREE.MeshBasicMaterial({ map: drawParchment(item) }));
        sheet.position.set(x, y + 0.24, 0);
        display.add(sheet);
        const roll = makeItemModel(item);
        roll.position.set(x, y - 1.06, 0.1);
        roll.scale.setScalar(4.5);
        roll.rotation.set(0.16, -0.18, 0.05);
        display.add(roll);
    }
    display.add(new THREE.AmbientLight(0xfff1df, 0.9));
    const light = new THREE.DirectionalLight(0xffe6cd, 1.2);
    light.position.set(-3, 5, 5);
    display.add(light);
    h.bare();
    h.cam([0, 45, 1.75], [0, 45, -5]);
    await h.shot('scroll-textures', { settle: 8 });
}
