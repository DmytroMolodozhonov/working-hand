/** Round pentagram tablets. Two bounded 512² atlases hold every learned figure; no per-item materials. */
import * as THREE from 'three';
import { figureOf, figureIds, figureLines } from './PentagramRules.js';

const TILE = 128, SIDE = 512, R = 0.2, CY = 0.13;
const pages = new Map(), faces = new Map(), bodies = new Map();
const shared = value => { (value.userData ||= {}).shared = true; return value; };
let bodyGeo, rimGeo;

function paintTile(ctx, id, x, y) {
    const dark = !!figureOf(id)?.def?.dark;
    ctx.save();ctx.translate(x,y);
    const bg=ctx.createRadialGradient(48,38,4,64,64,85);
    bg.addColorStop(0,dark?'#493b50':'#f3e9cd');bg.addColorStop(1,dark?'#17131f':'#a99a78');
    ctx.fillStyle=bg;ctx.fillRect(0,0,TILE,TILE);
    // Fine stone grain, hairline scratches and a worn rim, all seeded by the tile.
    let seed=913;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<550;i++){ctx.fillStyle=rng()<.5?'rgba(0,0,0,.09)':'rgba(255,255,255,.12)';ctx.fillRect(rng()*128,rng()*128,1+rng()*1.3,1);}
    ctx.strokeStyle=dark?'#92768d':'#8c703e';ctx.lineWidth=1.3;
    for(const radius of [57,53]){ctx.beginPath();ctx.arc(64,64,radius,0,Math.PI*2);ctx.stroke();}
    for(let i=0;i<24;i++){const a=i*Math.PI/12;ctx.beginPath();ctx.moveTo(64+54*Math.cos(a),64+54*Math.sin(a));ctx.lineTo(64+57*Math.cos(a+.025),64+57*Math.sin(a+.025));ctx.stroke();}
    // Exactly the in-world figure, not a generic star shared by the tablets.
    const draw=(color,width,offset=0)=>{
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';
        ctx.beginPath();ctx.arc(64,64+offset,46,0,Math.PI*2);ctx.stroke();
        for(const poly of figureLines(id)) {
            ctx.beginPath();poly.forEach(([px,pz],i)=>{const xx=64+px*45,yy=64-pz*45+offset;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});
            if(poly.length>2)ctx.closePath();ctx.stroke();
        }
    };
    draw(dark?'#09070c':'#fff9e9',3,1);draw(dark?'#e4a0ba':'#594129',1.5);
    ctx.restore();
}

function pageMaterial(page, ids) {
    if(pages.has(page))return pages.get(page);
    let map=null;
    if(typeof document!=='undefined') {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=SIDE;
        const ctx=canvas.getContext('2d');
        if(ctx){for(let i=page*16;i<Math.min(ids.length,(page+1)*16);i++)paintTile(ctx,ids[i],i%4*TILE,Math.floor(i%16/4)*TILE);
            map=shared(new THREE.CanvasTexture(canvas));map.anisotropy=4;}
    }
    const material=shared(new THREE.MeshLambertMaterial({map,color:map?0xffffff:0xc8b79a}));
    pages.set(page,material);return material;
}

export function pentagramTablet(item) {
    const ids=figureIds(),id=ids.includes(item?.pent)?item.pent:'devil',index=ids.indexOf(id);
    const dark=!!figureOf(id)?.def?.dark;
    if(!bodyGeo){bodyGeo=shared(new THREE.CylinderGeometry(R,R,.052,32));bodyGeo.rotateX(Math.PI/2);bodyGeo.translate(0,CY,0);
        rimGeo=shared(new THREE.TorusGeometry(.194,.008,6,32));rimGeo.translate(0,CY,0);}
    if(!bodies.has(dark))bodies.set(dark,[shared(new THREE.MeshLambertMaterial({color:dark?0x2b2331:0xcbbb98})),shared(new THREE.MeshLambertMaterial({color:dark?0x897080:0xb18d4d}))]);
    if(!faces.has(id)) {
        const geo=shared(new THREE.CircleGeometry(.187,32)),uv=geo.attributes.uv;
        const col=index%4,row=Math.floor(index%16/4);
        for(let i=0;i<uv.count;i++)uv.setXY(i,(col+uv.getX(i))/4,1-(row+1-uv.getY(i))/4);
        faces.set(id,geo);
    }
    const [stone,metal]=bodies.get(dark),front=pageMaterial(Math.floor(index/16),ids),group=new THREE.Group();
    group.name='pentagram-tablet';group.userData.pentagram=id;
    group.add(new THREE.Mesh(bodyGeo,stone),new THREE.Mesh(rimGeo,metal));
    for(const side of [-1,1]){const face=new THREE.Mesh(faces.get(id),front);face.position.set(0,CY,side*.027);if(side<0)face.rotation.y=Math.PI;group.add(face);}
    return group;
}
