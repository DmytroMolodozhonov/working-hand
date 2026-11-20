// A still lake (not the river, not the sea): a pit dug near the start and filled with water; the view over it at noon and a low look.
export default async function (h) {
    const g = h.g;
    h.time(0.5); h.bare();
    const { BLOCK } = await import('/src/world/Terrain.js');
    const d = g.world?.terrain?.data || g.terrain?.data;
    const X = 60, Z = 60, R = 16;
    const y0 = Math.floor(d.heightAt(X, Z));
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
        if (x * x + z * z > R * R) continue;
        for (let y = y0 - 5; y <= y0 + 2; y++) d.set(X + x, y, Z + z, y <= y0 - 1 ? BLOCK.WATER : BLOCK.AIR);
    }
    await h.go(X - 26, y0 + 8, Z);
    await h.frames(120);
    h.cam([X - 22, y0 + 6, Z], [X, y0 - 1, Z]);
    await h.shot('lake-high', { settle: 40 });
    h.cam([X - 20, y0 + 2.2, Z - 6], [X + 4, y0 - 0.5, Z + 4]);
    await h.shot('lake-low', { settle: 10 });
}
