/** Stable Creative fixtures: no world recipe changes, ordinary targetable CastleLife NPCs. */
export const ELEMENTAL_TESTS = [
 {element:'water',name:'Нерея',x:-24,z:-26,seed:971207},
 {element:'air',name:'Аэрион',x:27,z:24,seed:971208},
 {element:'fire',name:'Игнис',x:-27,z:30,seed:971209},
];
const COLORS={water:[0x315f96,0xc4e5ee,0x203a60],air:[0xe7e4d9,0xb4c8c8,0x687e89],fire:[0x923b2d,0xe8aa49,0x362c32]};
export function elementalLook(element,{tank=false,wings=false}={}){
 const [base,trim,dark]=COLORS[element];
 return {element,tank,wings,wizard:true,tool:'none',outfit:null,uniform:null,hat:'none',dress:false,dressColor:base,shirt:base,pants:dark,accent:trim,boots:dark,magicRobe:false};
}
export function elementalTestSite(a,F){
 return {id:'creative-'+a.element,kind:'elemental',name:'Площадка мага '+({water:'воды',air:'воздуха',fire:'огня'}[a.element]),x:a.x,z:a.z,F,zone:18,gx:0,gz:0,knights:0,population:1,color:COLORS[a.element][0],
 houses:[],stalls:[],fields:[],posts:[],beds:[],chests:[],pens:[],graves:[],graveyards:[],rooms:[],nodes:[],edges:[],
 people:[{idx:1,seed:a.seed,role:'mage',element:a.element,name:a.name,female:a.element==='water',mana:220,robe:false,look:elementalLook(a.element,{tank:a.element==='water'})}]};
}
