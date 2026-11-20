/** Clouds alone are not enough. Storm.thunder includes summoned rain and the local sea storm. */
export function stormSpellBlock(game,name){
 return (name==='LightningStrike'||name==='Thunderwave')&&!game.storm?.thunder
  ?'⛈️ Это заклинание можно использовать только во время грозы — естественной или вызванной магией':null;
}
