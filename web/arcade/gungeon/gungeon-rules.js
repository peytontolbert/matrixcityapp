export const ROOM_CATEGORY={CONNECTOR:0,HUB:1,NORMAL:2,BOSS:3,REWARD:4,SPECIAL:5,SECRET:6,ENTRANCE:7,EXIT:8};

export function randomRange(random,min,maxExclusive){return min+Math.floor(random()*Math.max(0,maxExclusive-min))}

export function selectByWeight(entries,random,excluded=new Set()){
  const available=entries.filter((_,index)=>!excluded.has(index));
  if(!available.length)return null;
  const total=available.reduce((sum,entry)=>sum+Math.max(0,Number(entry.weight) || 0),0);
  if(total<=0)return available[available.length-1];
  const target=random()*total;let cumulative=0;
  for(const entry of available){cumulative+=Math.max(0,Number(entry.weight)||0);if(cumulative>target)return entry}
  return available[available.length-1];
}

export function evolveChain(current,rules,random,mandatoryOnly=false){
  const applicable=rules.filter(rule=>(!mandatoryOnly||rule.mandatory)&&current.includes(rule.form));
  if(!applicable.length)return current;
  const rule=selectByWeight(applicable,random);if(!rule)return current;
  const matches=[];let from=0;
  while(from<=current.length-rule.form.length){const index=current.indexOf(rule.form,from);if(index<0)break;matches.push(index);from=index+Math.max(1,rule.form.length)}
  if(!matches.length)return current;
  const index=matches[randomRange(random,0,matches.length)];
  return current.slice(0,index)+rule.target+current.slice(index+rule.form.length);
}

export function evolveChainToCompletion(config,random){
  const target=randomRange(random,config.minLength,config.maxLength+1);let chain=config.initial||'n',guard=0;
  while(chain.length<target&&guard++<256){const before=chain;chain=evolveChain(chain,config.rules,random,false);if(chain.length>=target){let mandatory=true,mandatoryGuard=0;while(mandatory&&mandatoryGuard++<256){const next=evolveChain(chain,config.rules,random,true);mandatory=next!==chain;chain=next}}if(chain===before)break}
  return chain;
}

const FLOOR_RULES=[
  {form:'n',target:'nn',weight:5},
  {form:'n',target:'nt',weight:1.4},
  {form:'n',target:'nhn',weight:.8},
  {form:'h',target:'hn',weight:.5},
  {form:'tt',target:'tn',weight:1,mandatory:true}
];

export function buildFloorFlow(floor,random){
  const chain=evolveChainToCompletion({initial:'n',rules:FLOOR_RULES,minLength:5+Math.min(floor,2),maxLength:7+Math.min(floor,3)},random);
  const nodes=[{id:'entrance',kind:'entrance',category:ROOM_CATEGORY.ENTRANCE,parent:null}];
  let normalIndex=0;
  for(const symbol of chain){const kind=symbol==='t'?'trap':symbol==='h'?'hub':'combat';nodes.push({id:`${kind}-${++normalIndex}`,kind,category:symbol==='h'?ROOM_CATEGORY.HUB:ROOM_CATEGORY.NORMAL,parent:nodes.at(-1).id})}
  const insertionCandidates=[];for(let i=2;i<nodes.length;i++)insertionCandidates.push(i);
  const shopAt=insertionCandidates.splice(randomRange(random,0,insertionCandidates.length),1)[0];nodes.splice(shopAt,0,{id:'shop',kind:'shop',category:ROOM_CATEGORY.SPECIAL,parent:nodes[shopAt-1].id});
  const rewardAt=Math.min(nodes.length-1,Math.max(3,randomRange(random,3,nodes.length)));nodes.splice(rewardAt,0,{id:'reward',kind:'treasure',category:ROOM_CATEGORY.REWARD,parent:nodes[rewardAt-1].id});
  if(random()<.72){const secretAt=randomRange(random,2,nodes.length-1);nodes.splice(secretAt,0,{id:'secret',kind:'secret',category:ROOM_CATEGORY.SECRET,parent:nodes[secretAt-1].id,hidden:true})}
  if(random()<.55){const shrineAt=randomRange(random,2,nodes.length);nodes.splice(shrineAt,0,{id:'shrine',kind:'shrine',category:ROOM_CATEGORY.SPECIAL,parent:nodes[shrineAt-1].id})}
  nodes.push({id:'boss',kind:'boss',category:ROOM_CATEGORY.BOSS,parent:nodes.at(-1).id},{id:'exit',kind:'exit',category:ROOM_CATEGORY.EXIT,parent:'boss'});
  for(let i=0;i<nodes.length;i++){nodes[i].index=i+1;nodes[i].parent=i?nodes[i-1].id:null;nodes[i].children=i+1<nodes.length?[nodes[i+1].id]:[]}
  return nodes;
}
