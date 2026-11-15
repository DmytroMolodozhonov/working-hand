// The air vortex: hover, climb when the look is raised (the camera's direction is overridden), stop.   node tools/shot.mjs air-vortex --mode creative
export default async function (h) {
    const g = h.g, ch = g.character;
    await h.frames(40);
    g.heroElement.set('air', { say: false });
    h.log('cast', g.airVortex.cast(true));
    await h.frames(60); h.log('hover y', ch.group.position.y.toFixed(2));
    const real = g.camera.getWorldDirection.bind(g.camera);
    g.camera.getWorldDirection = (v) => v.set(0, 0.9, 0.43).normalize();
    const y0 = ch.group.position.y; await h.frames(120); h.log('looking up 2 s: y', y0.toFixed(2), '→', ch.group.position.y.toFixed(2));
    g.camera.getWorldDirection = (v) => v.set(0, -0.9, 0.43).normalize();
    await h.frames(200); h.log('looking down: y', ch.group.position.y.toFixed(2), 'ground+hover ~', (1.5).toFixed(2));
    g.camera.getWorldDirection = real;
    h.log('stop', g.airVortex.stop('stop')); await h.frames(120); h.log('after stop y', ch.group.position.y.toFixed(2), 'gravityK', ch.gravityK);
    h.log('done');
}
