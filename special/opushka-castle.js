import * as THREE from 'three';
import { smoothstep } from '../src/core/math.js';
import { createRng } from '../src/core/math.js';

export const CASTLE_PLAN = { dx: 55, dz: -68, width: 65, depth: 60 };
const MARKET_HOUSES = [
    { dx: 36, dz: -30, width: 6.7, depth: 5.6, style: 'cottage' },
    { dx: 48, dz: -30, width: 5.8, depth: 5.1, style: 'workshop' },
    { dx: 73, dz: -30, width: 7.8, depth: 7.2, style: 'hall' },
    { dx: 83, dz: -40, width: 6.1, depth: 5.6, style: 'cottage' },
];
const houseTypes = {
    hut: [4.6, 4.1], cottage: [6.1, 5.2], longhouse: [8.9, 4.75], barn: [7.2, 5.1],
    hall: [7.3, 5.8], manor: [8.1, 6], brick: [5.65, 5.2], towerhouse: [4.7, 4.55],
};
// The mixed rows follow separate streets. Front doors turn towards the nearest street.
const districts = [
    [
        [13,-27,'hut',90],[13,-39,'cottage',96],[9,-52,'longhouse',79],[9,-64,'brick',93],[11,-76,'hut',101],
        [26,-30,'longhouse',-74],[25,-45,'hall',-91],[23,-57,'cottage',-88],[24,-69,'barn',-98],[25,-82,'hut',-82],
        [3,-40,'barn',88],[0,-70,'longhouse',82],
    ],[
        [29,-7,'hut',-164],[41,-5,'cottage',-171],[53,-6,'brick',177],[65,-7,'longhouse',161],[77,-6,'hut',-169],
        [33,10,'barn',-11],[45,12,'cottage',7],[58,10,'longhouse',-9],[72,11,'hut',12],[84,6,'brick',17],
    ],[
        [87,-54,'towerhouse',70],[90,-67,'hall',75],[95,-79,'manor',92],
        [103,-52,'manor',-71],[105,-65,'brick',-83],[110,-78,'cottage',-96],
        [101,-38,'cottage',-1],[112,-39,'barn',-11],[110,-26,'longhouse',149],[95,-23,'hut',-148],
    ],
];
export const CASTLE_HOUSES = [
    ...MARKET_HOUSES,
    ...districts.flat().map(([dx,dz,style,face],i)=>{
        const [w,d]=houseTypes[style], scale=.93+(i*17%13)/83;
        return {dx,dz,width:w*scale,depth:d/scale,style,yaw:face*Math.PI/180,variant:i};
    }),
];
export const MARKET_SITE = { dx: 58, dz: -25, width: 29, depth: 10 };
export const TOWN_PATHS = [
    { wide: 2.15, points: [[12,-9],[25,-14],[33,-20],[47,-18],[60,-20],[65,-29],[64,-40]] },
    { wide: 1.25, points: [[32,-20],[34,-23],[36.8,-26.3]] },
    { wide: 1.15, points: [[46,-18],[48.7,-22],[46.7,-26.6]] },
    { wide: 1.55, points: [[60,-20],[68,-17],[73,-21],[73,-25.3]] },
    { wide: 1.10, points: [[73,-21],[78,-24],[82,-30],[83.8,-36.1]] },
    { wide: 1.85, points: [[64,-46],[62,-50],[60,-57],[53,-64],[45.6,-74.6]] },
    { wide: 1.10, points: [[61,-54],[69,-53],[76,-57],[79,-61]] },
    { wide: 1.45, points: [[34,-21],[23,-21],[19,-33],[18,-47],[16,-61],[18,-76],[18,-85]] },
    { wide: .88, points: [[17,-41],[8,-45],[4,-42]] },
    { wide: .92, points: [[17,-65],[9,-70],[4,-71]] },
    { wide: 1.35, points: [[26,-16],[31,-1],[43,3],[59,2],[71,2],[87,-1],[95,-14],[92,-28]] },
    { wide: 1.62, points: [[78,-24],[89,-30],[97,-42],[96,-53],[98,-67],[103,-80],[102,-85]] },
    { wide: 1.25, points: [[95,-25],[104,-29],[113,-46],[111,-60],[117,-66]] },
];

export function settlementSites(seed, height, startX, startZ, limit=470) {
    const rng=createRng(seed^0x158aa9);
    const sites=[{id:0,kind:'castle',x:startX,z:startZ,seed}];
    const add=(kind,count)=>{
        const large=kind==='castle',extent=large?122:14,gap=large?221:85;
        for(let i=0,t=0;i<count&&t<640;t++){
            const x=Math.round((rng()*2-1)*(limit-extent-19)),z=Math.round((rng()*2-1)*(limit-extent-19));
            if(z< -256||Math.hypot(x,z)<110||sites.some(v=>Math.hypot(x-v.x,z-v.z)<gap))continue;
            const offset=large?53:0,side=large?33:12;
            const hits=[[-side,-side],[side,-side],[-side,side],[side,side],[0,0]].map(([a,b])=>height(x+offset+a,z+b));
            if(hits.some(y=>y<-.25||y>19)||Math.max(...hits)-Math.min(...hits)>13)continue;
            sites.push({id:sites.length,kind,x,z,seed:Math.floor(rng()*0x7ffffffe)+1});
            i++;
        }
    };
    add('castle',1);
    add('settlement',4);
    return sites;
}

export function castleGrade(dx, dz, natural) {
    const x = dx - CASTLE_PLAN.dx, z = dz - CASTLE_PLAN.dz;
    const core = 1 - smoothstep(.89, 1.55, Math.max(Math.abs(x) / 32, Math.abs(z - 8) / 42));
    const rise = 6.7 * (1 - smoothstep(-17, 19, z + .21 * x));
    const ridge = 1.3 * (1 - smoothstep(-24, 21, x)) * (1 - smoothstep(-18, 19, z));
    const terrace = 1-smoothstep(1,1.55,Math.max(Math.abs(x+9)/9.2,Math.abs(z+13)/7.5));
    const ground=natural+(1.3+rise+ridge-natural)*core;
    const fortified=ground+(8.8-ground)*terrace;
    if(dx < -12 || dx > 131 || dz < -105 || dz > 28)return fortified;
    const west=1-smoothstep(.53,1.08,Math.max(Math.abs(dx-15)/27,Math.abs(dz+54)/50));
    const market=1-smoothstep(.58,1.17,Math.max(Math.abs(dx-58)/47,Math.abs(dz+5)/27));
    const east=1-smoothstep(.56,1.13,Math.max(Math.abs(dx-102)/25,Math.abs(dz+55)/47));
    const town=Math.max(west,market,east)*(1-core);
    return fortified+(1.5+Math.sin(dx*.073+dz*.066)*.66+east*.73-fortified)*town;
}

export function buildOpushkaCastle(site, plan, id) {
    const {dx,dz,width,depth}=plan;
    const V3=THREE.Vector3,x=site.origin.x+dx,z=site.origin.z+dz,y=0;
    const surface=(a,b)=>site.api.ground(x+a,z+b);
    const home={id,x,y,z,style:'castle',width,depth,ruined:false};
    const add=(...args)=>site.piece(home,...args);
    const archMat='castleDressed';
    const rough='castleRock';
    const lowRing=[[-24,18],[-29,4],[-27,-14],[-17,-25],[0,-28],[17,-24],[29,-12],[30,7],[25,18],[17,23]];
    const gateX=9,gateZ=23,gateBase=surface(gateX,gateZ+2);
    home.door=new V3(x+gateX,gateBase,z+gateZ+5);
    home.outline=[...lowRing,[gateX,gateZ],[-9,25]].map(([dx,dz])=>[x+dx,z+dz]);

    function foundation(px,pz,sx,sz,base,turn=0) {
        const radius=Math.hypot(sx,sz)*.36;
        const low=Math.min(surface(px,pz),surface(px-radius,pz),surface(px+radius,pz),surface(px,pz+radius),surface(px,pz-radius))-.47;
        const h=Math.max(.62,base-low);
        return add(rough,px,base-h/2,pz,sx,h,sz,{turn,solid:true});
    }

    function pier(px,pz,sx,sz,base,top,turn=0,footing=null) {
        let support=footing || foundation(px,pz,sx+.28,sz+.28,base,turn);
        const rows=Math.ceil((top-base)/1.4),height=(top-base)/rows;
        for(let row=0;row<rows;row++) {
            const mat=row%4===3?'castleShadow':rough;
            support=add(mat,px,base+(row+.5)*height,pz,sx,height+.013,sz,{turn,supports:[support]});
        }
        return support;
    }

    function curtain(a,b,height,thick=1.47) {
        const len=Math.hypot(b[0]-a[0],b[1]-a[1]),segments=Math.ceil(len/3.6),step=len/segments;
        const ux=(b[0]-a[0])/len,uz=(b[1]-a[1])/len,turn=-Math.atan2(uz,ux);
        for(let i=0;i<segments;i++) {
            const mid=(i+.5)*step,px=a[0]+ux*mid,pz=a[1]+uz*mid;
            const base=surface(px,pz)-.1,top=base+height+.24*Math.sin(px*.28+pz*.21);
            const wall=pier(px,pz,step+.11,thick,base,top,turn);
            add(archMat,px,top-.09,pz,step+.14,.23,thick+.22,{turn,supports:[wall]});
            for(const offset of [-step*.28,step*.23]) {
                add(rough,px+ux*offset,top+.30,pz+uz*offset,.94,.71,thick*.84,{turn,supports:[wall]});
            }
            if(i%3===1){const bx=px-uz*thick*.47,bz=pz+ux*thick*.47;
                pier(bx,bz,1.08,1.55,base,top-1.1,turn);}
        }
    }
    for(let i=0;i<lowRing.length-1;i++)curtain(lowRing[i],lowRing[i+1],i<3?5.6:i<8?5.0:6.1);
    curtain(lowRing.at(-1),[gateX+2.3,gateZ],6.15,1.8);
    curtain([gateX-2.3,gateZ],[-9,25],6.15,1.8);
    curtain([-9,25],lowRing[0],5.45,1.7);

    function turret(px,pz,rise,radius,sides,withRoof=false) {
        const base=surface(px,pz)-.17,top=base+rise;
        let support=foundation(px,pz,radius*1.59,radius*1.59,base);
        const bands=Math.ceil(rise/1.4),height=rise/bands,turn=Math.PI/sides;
        for(let i=0;i<bands;i++){
            const r=radius*(1.02-.075*i/bands);
            const g=new THREE.CylinderGeometry(r,r+.079,height+.025,sides,1,false,turn);
            g.attributes.uv.array.forEach((v,j)=>{g.attributes.uv.array[j]=v*(j%2?height/2.2:r*2.65);});
            support=add(i%4===2?'castleShadow':rough,px,base+(i+.5)*height,pz,r*2,height,r*2,{geometry:g,supports:[support],round:r});
        }
        add(archMat,px,top+.05,pz,radius*2.04,.39,radius*2.04,{geometry:new THREE.CylinderGeometry(radius*1.03,radius*.97,.39,sides),round:radius,supports:[support]});
        const crown=[];
        for(let i=0;i<sides;i++){
            const a=2*Math.PI*(i+.5)/sides;
            crown.push(add(rough,px+Math.sin(a)*radius*.88,top+.54,pz+Math.cos(a)*radius*.88,1.03,.94,.57,{turn:a,supports:[support]}));
        }
        if(withRoof){
            const cap=add('slate',px,top+1.62,pz,radius*1.85,3,radius*1.85,{
                geometry:new THREE.ConeGeometry(radius*.94,3,sides,1,false,turn),solid:false,roof:true,supports:[support]});
            cap.mesh.name='watch-roof';
        }
        for(let i=0;i<Math.min(sides,5);i++){
            const a=i*Math.PI*2/sides,reach=radius*Math.cos(Math.PI/sides)+.014;
            add('dark',px+Math.sin(a)*reach,top-1.57,pz+Math.cos(a)*reach,.16,.93,.095,{turn:a,solid:false,supports:[support]});
        }
        return crown;
    }
    turret(-28,-7,10.2,3.2,8);
    turret(-13,-26,13.3,3.44,8);
    turret(21,-19,8.4,2.64,10,true);
    turret(28,7,9.5,3.1,8);
    turret(-18,23,7.4,2.55,10,true);
    turret(gateX-4.68,gateZ+.4,11.1,3.0,8);
    turret(gateX+4.75,gateZ-.67,12.45,3.10,8);

    const gateGap=2.22,head=3.95;
    const gatePiers=[-1,1].map(s=>pier(gateX+s*3.0,gateZ,1.7,5.5,gateBase,gateBase+8.15));
    add(rough,gateX,gateBase+6.7,gateZ,4.55,2.9,4.78,{supports:gatePiers});
    // Voussoirs around the opening leave a clear centre for the working gate.
    for(let i=0;i<=12;i++){
        const a=i*Math.PI/12;
        const px=gateX+Math.cos(a)*gateGap,pz=gateZ+2.52,py=gateBase+head-1.49+Math.sin(a)*1.72;
        add(archMat,px,py,pz,.50,.64,.64,{angle:a-Math.PI/2,supports:gatePiers});
    }
    for(const s of [-1,1]){
        add(archMat,gateX+s*gateGap,gateBase+1.22,gateZ+2.52,.52,2.54,.61,{supports:gatePiers});
        add('banner',gateX+s*1.36,gateBase+6.31,gateZ+2.45,.85,1.79,.026,{solid:false,supports:gatePiers});
    }
    site.door(home,gateX,gateZ+.87,2.07,3.80,true,gateBase);
    for(let i=0;i<4;i++){
        const pz=gateZ+2.7+i*.75,base=surface(gateX,pz);
        add(archMat,gateX,base+.05,pz,5.1,.16,.83,{supports:gatePiers});
    }
    // A lower outwork diverts the approach around the gate before the inner court.
    curtain([-1,31],[2,28],2.2,1.22);
    curtain([15,25],[18,30],2.35,1.25);

    const keepX=-9,keepZ=-13,keepW=16,keepD=12;
    home.keep={x:x+keepX,z:z+keepZ,w:keepW,d:keepD};
    const base=surface(keepX,keepZ+keepD/2),top=base+15.1;
    const gateCross=[[keepX-18,1],[keepX-7,1],[keepX+7,2.4],[24,1]];
    curtain(gateCross[0],gateCross[1],3.8,1.34);
    curtain(gateCross[2],gateCross[3],3.8,1.34);
    const keepSupports=[];
    for(const direction of [-1,1]) {
        const px=keepX+direction*keepW/2;
        for(let i=-1;i<=1;i++){
            const pz=keepZ+i*4;
            const p=pier(px,pz,1.65,4.1,base,top);
            keepSupports.push(p);
            if(i!==0)pier(px+direction*.66,pz,1.10,1.20,base,top-1.1);
        }
    }
    for(let i=-2;i<=2;i++)keepSupports.push(pier(keepX+i*3.1,keepZ-keepD/2,3.22,1.55,base,top));
    for(const s of [-1,1]){
        const px=keepX+s*5.25,pz=keepZ+keepD/2;
        const p=pier(px,pz,5.59,1.58,base,top);
        keepSupports.push(p);
        add(archMat,px,base+.83,pz+.91,5.59,.3,.24,{supports:[p]});
        for(let row=0;row<3;row++)for(let col=-1;col<=1;col++){
            const slot=px+col*1.51,h=base+3.4+row*3.8;
            add('dark',slot,h,pz+.801,.22,1.31,.037,{solid:false,supports:[p]});
            add(archMat,slot,h-.69,pz+.95,.46,.18,.24,{supports:[p]});
        }
    }
    const entryX=keepX-.38,entryZ=keepZ+keepD/2;
    const entrance=add(rough,entryX,base+9.0,entryZ,5.76,12.2,1.65,{supports:keepSupports.slice(-2)});
    for(const s of [-1,1])pier(entryX+s*1.45,entryZ,1.10,1.78,base,base+3.1);
    site.door(home,entryX,entryZ,1.0,2.91,true,base);
    add(archMat,keepX,base+14.1,keepZ,keepW+.58,.45,keepD+.44,{supports:[entrance,...keepSupports],solid:false});
    for(let i=-3;i<=3;i++)for(const s of [-1,1]){
        add(rough,keepX+i*2.45,top+.42,keepZ+s*keepD/2,1.35,1,.93,{supports:[entrance,...keepSupports]});
    }
    for(const s of [-1,1])for(let i=-2;i<=2;i++){
        add(rough,keepX+s*keepW/2,top+.42,keepZ+i*2.39,.93,1,1.36,{supports:keepSupports});
    }
    const terrace=add(rough,keepX,base+.035,keepZ,keepW-1.46,.21,keepD-1.1,{solid:false});
    const roof=add(rough,keepX,top-.26,keepZ,keepW-.95,.45,keepD-.78,{solid:false,roof:true,supports:keepSupports});
    roof.mesh.name='keep-roof';
    // Protected hall, separate stair building, dark oak throne and upper galleries.
    const tx=keepX,tz=keepZ-2.12;
    add('banner',tx,base+.18,tz+3.7,2.35,.022,7.35,{solid:false,supports:[terrace]});
    add(archMat,tx,base+.34,tz,3.1,.39,1.95,{supports:[terrace]});
    add('joinery',tx,base+.93,tz,.89,.45,.76,{supports:[terrace]});
    add('beam',tx,base+1.39,tz-.38,.89,1.21,.13,{supports:[terrace]});
    add('brass',tx,base+2.04,tz-.38,.93,.12,.18,{supports:[terrace]});
    add('banner',tx,base+4.14,tz-1.6,2.18,2.66,.028,{solid:false,supports:[entrance]});
    for(const side of [-1,1]){
        for(let i=0;i<3;i++){
            const a=keepX+side*4.2,b=keepZ-3.9+i*3.8;
            const column=pier(a,b,.53,.53,base,base+5.42);
            add(archMat,a,base+5.4,b,.85,.31,.81,{supports:[column]});
        }
    }
    const stair=turret(keepX-9.34,keepZ+3.9,16.7,2.55,8);
    add('banner',keepX-9.34,base+9.3,keepZ+6.14,1.1,2.95,.027,{solid:false,supports:stair});
    home.throne=new V3(x+tx,base+.55,z+tz+.95);
    home.advisor=new V3(x+tx+1.87,base+.24,z+tz+1.3);
    home.towerTarget=new V3(x+gateX+4.75, surface(gateX+4.75,gateZ),z+gateZ-.67);
    return home;
}
