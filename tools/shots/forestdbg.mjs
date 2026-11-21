export default async function (h, args) {
    const g = h.g, d = g.world.terrain.data, H = d.heightAt;
    const x = args?.x ?? 480, z = args?.z ?? 240;
    h.log('biome there', d.biomeAt(x, z), 'grove', d.land.grove(x, z).toFixed(2));
    await h.go(x, H(x, z) + 8, z, true);
    await h.until(() => d.hasChunk(Math.floor(x / 32), Math.floor(z / 32)), 120000);
    const c = d.chunk(Math.floor(x / 32), Math.floor(z / 32));
    let f = 0; for (const b of c.bio) if (b === 1) f++;
    const R = await import('/src/world/ForestRules.js');
    const it = R.forestOfChunk(d, c);
    h.log('chunk', c.cx, c.cz, 'forest cols', f, 'items', it.length, 'trees', c.trees?.length, 'floor on', g.forestFloor.on, 'floor chunks', g.forestFloor.chunks.size);
    await h.frames(20);
    let items = 0; for (const k of g.forestFloor.chunks.values()) items += k.items.length; h.log('floor items', items, 'drawn', g.forestFloor.stats.drawn);
}
