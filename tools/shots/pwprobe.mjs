// (a probe, not a picture: which prewarm groups are slow — Game._pwSlow; the world's stage)
export default async function (h) {
    h.log(JSON.stringify((h.g._pwSlow || []).slice(0, 12).map((x) => [Math.round(x.ms), x.i, x.what])));
}
