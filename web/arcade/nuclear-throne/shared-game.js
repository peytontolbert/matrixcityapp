import {WEAPONS,WEAPON_IDS} from './weapon-catalogue.js';
export const TICK_RATE = 30;
export const WIDTH = 320;
export const HEIGHT = 240;

const STAGES=['DESERT','SEWERS','SCRAPYARD','CRYSTAL CAVES','FROZEN CITY','JUNGLE','THE LABS','THE PALACE'];
const MUTATIONS=[
  ['rhino','RHINO SKIN','+4 maximum HP'],['teeth','IMPACT WRISTS','Kills damage nearby enemies'],
  ['paw','RABBIT PAW','More ammo and health drops'],['marrow','BOLT MARROW','Bolts seek enemies'],
  ['fingers','SHOTGUN FINGERS','Tighter shotgun spread'],['veins','BOILING VEINS','Explosion immunity at low HP'],
  ['spirit','STRONG SPIRIT','Survive one lethal hit per area'],['feet','EXTRA FEET','Faster movement']
];

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rng=s=>{s.seed=(s.seed*1664525+1013904223)>>>0;return s.seed/4294967296};
const id=s=>`${s.tick.toString(36)}${(s.nextId++).toString(36)}`;
const circleRect=(x,y,r,o)=>x+r>o.x&&x-r<o.x+o.w&&y+r>o.y&&y-r<o.y+o.h;
function blocked(s,x,y,r=5){return x-r<9||x+r>WIDTH-9||y-r<9||y+r>HEIGHT-9||s.obstacles.some(o=>circleRect(x,y,r,o))}
function moveBody(s,e,dx,dy,r=e.radius||5){const nx=e.x+dx;if(!blocked(s,nx,e.y,r))e.x=nx;const ny=e.y+dy;if(!blocked(s,e.x,ny,r))e.y=ny;e.x=clamp(e.x,10+r,WIDTH-10-r);e.y=clamp(e.y,10+r,HEIGHT-10-r)}
function safePoint(s,minFromPlayers=55){for(let n=0;n<100;n++){const p={x:22+rng(s)*(WIDTH-44),y:22+rng(s)*(HEIGHT-44)};if(!blocked(s,p.x,p.y,10)&&Math.hypot(p.x-160,p.y-190)>minFromPlayers&&Object.values(s.players).every(v=>dist(p,v)>minFromPlayers))return p}return{x:35,y:35}}

export function createRun(seed=Date.now()>>>0){
  const s={seed,tick:0,nextId:1,area:1,level:1,loop:0,phase:'playing',message:'',messageTime:0,players:{},enemies:[],bullets:[],drops:[],effects:[],obstacles:[],portal:null,mutationChoices:[],stats:{kills:0,bosses:0},roomTitle:'1-1 DESERT'};
  generateRoom(s);return s;
}

function generateRoom(s){
  s.phase='playing';s.portal=null;s.enemies=[];s.bullets=[];s.drops=[];s.effects=[];s.obstacles=[];
  const stage=STAGES[Math.min(STAGES.length-1,s.area-1)],label=`${s.area}-${s.level}`;
  s.roomTitle=`${label} ${stage}`;s.message=s.roomTitle;s.messageTime=2;
  const count=3+Math.min(5,s.area)+s.level;
  for(let i=0;i<3+Math.min(4,s.area);i++){
    const w=(1+Math.floor(rng(s)*2))*16,h=(1+Math.floor(rng(s)*2))*16;
    const o={x:32+Math.floor(rng(s)*14)*16,y:32+Math.floor(rng(s)*9)*16,w,h};
    if(Math.hypot(o.x+o.w/2-160,o.y+o.h/2-190)>55)s.obstacles.push(o);
  }
  for(const p of Object.values(s.players)){p.x=152+rng(s)*16;p.y=190+rng(s)*10;p.invuln=1;p.dead=false;p.hp=Math.max(1,p.hp)}
  const isBoss=s.level===3;
  if(s.level===1)s.drops.push({id:id(s),type:'weapon',weapon:randomWeapon(s),...safePoint(s,35),value:1});
  if(isBoss)spawnEnemy(s,'boss');
  for(let i=0;i<count+(isBoss?2:0);i++)spawnEnemy(s,i%5===0?'scorpion':i%2?'bandit':'maggot');
}

function spawnEnemy(s,type){const p=safePoint(s,70),base=1+(s.area-1)*.18+s.loop*.65;const defs={maggot:[3,4.5],bandit:[8,6],scorpion:[16,10],boss:[85,13]};const [hp,r]=defs[type];s.enemies.push({id:id(s),type,x:p.x,y:p.y,vx:0,vy:0,hp:hp*base,maxHp:hp*base,radius:r,cooldown:rng(s),state:'idle',timer:0,flash:0})}
export function addPlayer(s,pid,name='FISH'){
  if(s.players[pid])return;
  const index=Object.keys(s.players).length;
  s.players[pid]={id:pid,name:String(name).slice(0,18)||'FISH',x:152+index*12,y:194,hp:8,maxHp:8,radius:6,weapon:'revolver',second:'shotgun',ammo:{bullets:96,shells:24,bolts:18,explosives:8,energy:48},rads:0,level:1,cooldown:0,invuln:1,dead:false,input:{},mutations:[],spirit:true,kills:0};
}
export function removePlayer(s,pid){delete s.players[pid]}
export function setInput(s,pid,input){const p=s.players[pid];if(!p)return;p.input={up:!!input.up,down:!!input.down,left:!!input.left,right:!!input.right,shoot:!!input.shoot,swap:!!input.swap,pickup:!!input.pickup,aimX:Number(input.aimX)||p.x+1,aimY:Number(input.aimY)||p.y};}
export function chooseMutation(s,pid,key){const p=s.players[pid];if(!p||s.phase!=='mutation'||!s.mutationChoices.some(m=>m[0]===key))return false;for(const v of Object.values(s.players)){if(!v.mutations.includes(key))v.mutations.push(key);if(key==='rhino'){v.maxHp+=4;v.hp+=4}if(key==='spirit')v.spirit=true}s.area++;s.level=1;generateRoom(s);return true}

function firePlayer(s,p){
  const w=WEAPONS[p.weapon],ammo=w.ammo?(p.ammo[w.ammo]||0):Infinity;if(p.cooldown>0||ammo<w.cost||(w.blood&&p.hp<=1))return;
  if(w.ammo)p.ammo[w.ammo]-=w.cost;if(w.blood)p.hp--;p.cooldown=w.cooldown;let angle=Math.atan2(p.input.aimY-p.y,p.input.aimX-p.x);
  const spread=p.mutations.includes('fingers')&&p.weapon==='shotgun'?w.spread*.55:w.spread;
  for(let n=0;n<w.shots;n++){const a=angle+(rng(s)-.5)*spread;const bid=id(s);s.bullets.push({id:bid,owner:p.id,team:'player',weapon:p.weapon,x:p.x+Math.cos(a)*8,y:p.y+Math.sin(a)*8,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,damage:w.damage,life:w.life||(w.explosive?1.1:1.45),radius:w.radius||(w.explosive?3:2),pierce:w.pierce||0,explosive:!!w.explosive,bounce:w.bounce||0,homing:!!w.homing,lightning:!!w.lightning,flame:!!w.flame})}
  s.effects.push({id:id(s),type:'muzzle',x:p.x+Math.cos(angle)*9,y:p.y+Math.sin(angle)*9,life:.08});
}
function enemyShoot(s,e,target){const a=Math.atan2(target.y-e.y,target.x-e.x),shots=e.type==='scorpion'?5:e.type==='boss'?7:1,spread=e.type==='boss'?.65:e.type==='scorpion'?.48:.08;for(let n=0;n<shots;n++){const q=a+(n-(shots-1)/2)*(spread/Math.max(1,shots-1));s.bullets.push({id:id(s),owner:e.id,team:'enemy',x:e.x+Math.cos(q)*e.radius,y:e.y+Math.sin(q)*e.radius,vx:Math.cos(q)*(e.type==='boss'?125:100),vy:Math.sin(q)*(e.type==='boss'?125:100),damage:e.type==='boss'?2:1,life:2.7,radius:2,pierce:0})}}
function hurtPlayer(s,p,damage){if(p.dead||p.invuln>0)return;p.hp-=damage;p.invuln=.75;s.effects.push({id:id(s),type:'blood',x:p.x,y:p.y,life:.3});if(p.hp<=0){if(p.spirit){p.spirit=false;p.hp=1;p.invuln=1.5}else{p.hp=0;p.dead=true}}}
function explode(s,b){s.effects.push({id:id(s),type:'explosion',x:b.x,y:b.y,life:.35});for(const e of s.enemies)if(Math.hypot(e.x-b.x,e.y-b.y)<35)e.hp-=b.damage*(1-Math.min(.7,Math.hypot(e.x-b.x,e.y-b.y)/50));for(const p of Object.values(s.players))if(!p.dead&&Math.hypot(p.x-b.x,p.y-b.y)<31&&!(p.mutations.includes('veins')&&p.hp<=4))hurtPlayer(s,p,3)}
function randomWeapon(s){const limit=Math.min(WEAPON_IDS.length,14+s.area*13+s.loop*8);return WEAPON_IDS[Math.floor(rng(s)*limit)]}
function killEnemy(s,e,killer){s.stats.kills++;if(killer)killer.kills++;s.effects.push({id:id(s),type:e.type==='boss'?'bigBlood':'blood',x:e.x,y:e.y,life:.65});const luck=killer?.mutations.includes('paw')?.26:.15;if(rng(s)<luck)s.drops.push({id:id(s),type:rng(s)<.42?'health':'ammo',x:e.x,y:e.y,value:1});if(e.type!=='boss'&&rng(s)<.025)s.drops.push({id:id(s),type:'weapon',weapon:randomWeapon(s),x:e.x,y:e.y,value:1});for(let n=0;n<(e.type==='boss'?12:e.type==='scorpion'?3:1);n++)s.drops.push({id:id(s),type:'rad',x:e.x+(rng(s)-.5)*10,y:e.y+(rng(s)-.5)*10,value:e.type==='boss'?4:1});if(e.type==='boss'){s.stats.bosses++;s.drops.push({id:id(s),type:'weapon',weapon:randomWeapon(s),x:e.x+12,y:e.y,value:1})}if(killer?.mutations.includes('teeth'))for(const x of s.enemies)if(x!==e&&dist(x,e)<34)x.hp-=2}
function updateEnemies(s,dt){
  const alive=Object.values(s.players).filter(p=>!p.dead);if(!alive.length)return;
  for(const e of s.enemies){e.cooldown-=dt;e.flash=Math.max(0,e.flash-dt);if(e.burn>0){e.burn-=dt;e.hp-=dt*1.5;}const p=alive.reduce((a,b)=>dist(e,a)<dist(e,b)?a:b),d=dist(e,p),a=Math.atan2(p.y-e.y,p.x-e.x);
    if(e.type==='maggot'){moveBody(s,e,Math.cos(a)*33*dt,Math.sin(a)*33*dt);if(d<e.radius+p.radius+2)hurtPlayer(s,p,1)}
    else if(e.type==='bandit'||e.type==='scorpion'){const desired=e.type==='bandit'?76:95;if(d>desired+12)moveBody(s,e,Math.cos(a)*20*dt,Math.sin(a)*20*dt);else if(d<desired-18)moveBody(s,e,-Math.cos(a)*18*dt,-Math.sin(a)*18*dt);if(e.cooldown<=0&&d<150){enemyShoot(s,e,p);e.cooldown=e.type==='scorpion'?1.55:1.05+rng(s)*.5}}
    else {e.timer-=dt;if(e.state==='dash'){moveBody(s,e,e.vx*dt,e.vy*dt);if(d<e.radius+p.radius+4)hurtPlayer(s,p,3);if(e.timer<=0){e.state='idle';e.cooldown=.55}}else if(e.cooldown<=0){if(rng(s)<.38){e.state='dash';e.timer=.38;e.vx=Math.cos(a)*150;e.vy=Math.sin(a)*150}else{enemyShoot(s,e,p);e.cooldown=.85}}else moveBody(s,e,Math.cos(a)*15*dt,Math.sin(a)*15*dt)}
  }
}
function updateBullets(s,dt){
  for(const b of s.bullets){b.life-=dt;if(b.homing&&b.team==='player'&&s.enemies.length){const target=s.enemies.reduce((a,e)=>dist(b,e)<dist(b,a)?e:a),want=Math.atan2(target.y-b.y,target.x-b.x),speed=Math.hypot(b.vx,b.vy),now=Math.atan2(b.vy,b.vx),turn=Math.atan2(Math.sin(want-now),Math.cos(want-now));b.vx=Math.cos(now+turn*.12)*speed;b.vy=Math.sin(now+turn*.12)*speed}b.x+=b.vx*dt;b.y+=b.vy*dt;if(blocked(s,b.x,b.y,b.radius)){if(b.bounce>0){b.vx*=-1;b.vy*=-1;b.bounce--;b.x+=b.vx*dt*2;b.y+=b.vy*dt*2}else{b.life=0;if(b.explosive)explode(s,b)}continue}
    if(b.team==='player'){for(const e of s.enemies){if(e.hp<=0||Math.hypot(e.x-b.x,e.y-b.y)>e.radius+b.radius)continue;e.hp-=b.damage;e.flash=.08;if(b.flame)e.burn=Math.max(e.burn||0,1.2);if(b.lightning){const chain=s.enemies.find(x=>x!==e&&x.hp>0&&dist(x,e)<45);if(chain)chain.hp-=b.damage*.65}const owner=s.players[b.owner];if(b.pierce-->0){}else{b.life=0;if(b.explosive)explode(s,b)}if(e.hp<=0)killEnemy(s,e,owner);break}}
    else for(const p of Object.values(s.players)){if(!p.dead&&Math.hypot(p.x-b.x,p.y-b.y)<p.radius+b.radius){hurtPlayer(s,p,b.damage);b.life=0;break}}
    if(b.explosive&&b.life<=0&&!s.effects.some(e=>e.type==='explosion'&&e.x===b.x&&e.y===b.y))explode(s,b)
  }
  s.bullets=s.bullets.filter(b=>b.life>0);s.enemies=s.enemies.filter(e=>e.hp>0);
}
function updateDrops(s){for(const p of Object.values(s.players)){if(p.dead)continue;for(const d of s.drops){if(d.taken||dist(p,d)>13)continue;if(d.type==='rad'){p.rads+=d.value;if(p.rads>=p.level*12){p.rads-=p.level*12;p.level++}}else if(d.type==='health'&&p.hp<p.maxHp)p.hp=Math.min(p.maxHp,p.hp+2);else if(d.type==='ammo'){for(const k of Object.keys(p.ammo))p.ammo[k]+=k==='bullets'?12:2}else if(d.type==='weapon'&&p.input.pickup){p.second=p.weapon;p.weapon=d.weapon}d.taken=true}}s.drops=s.drops.filter(d=>!d.taken)}
function finishRoom(s){if(s.enemies.length||s.portal)return;s.portal={x:160,y:58,radius:16,timer:.7};s.message='AREA CLEAR';s.messageTime=1.2}
function advance(s){if(s.level<3){s.level++;generateRoom(s)}else if(s.area>=STAGES.length){s.loop++;s.area=1;s.level=1;s.message=`LOOP ${s.loop}`;generateRoom(s)}else{s.phase='mutation';s.bullets=[];const pool=MUTATIONS.filter(m=>!Object.values(s.players).every(p=>p.mutations.includes(m[0])));s.mutationChoices=[];while(pool.length&&s.mutationChoices.length<3)s.mutationChoices.push(pool.splice(Math.floor(rng(s)*pool.length),1)[0]);if(!s.mutationChoices.length){s.area++;s.level=1;generateRoom(s)}}}

export function tick(s,dt){
  s.tick++;s.messageTime=Math.max(0,s.messageTime-dt);if(s.phase!=='playing')return;
  let living=0;for(const p of Object.values(s.players)){p.cooldown=Math.max(0,p.cooldown-dt);p.invuln=Math.max(0,p.invuln-dt);if(p.dead)continue;living++;const i=p.input||{},x=(i.right?1:0)-(i.left?1:0),y=(i.down?1:0)-(i.up?1:0),l=Math.hypot(x,y)||1,speed=p.mutations.includes('feet')?83:68;moveBody(s,p,x/l*speed*dt,y/l*speed*dt);if(i.swap){[p.weapon,p.second]=[p.second,p.weapon];p.input.swap=false}if(i.shoot)firePlayer(s,p)}
  if(Object.keys(s.players).length&&!living){s.phase='failed';s.message='WASTED'}
  updateEnemies(s,dt);updateBullets(s,dt);updateDrops(s);finishRoom(s);
  if(s.portal){s.portal.timer-=dt;if(s.portal.timer<=0&&Object.values(s.players).some(p=>!p.dead&&dist(p,s.portal)<18))advance(s)}
  for(const e of s.effects)e.life-=dt;s.effects=s.effects.filter(e=>e.life>0);
}
export function snapshot(s){return structuredClone(s)}
export {WEAPONS};
