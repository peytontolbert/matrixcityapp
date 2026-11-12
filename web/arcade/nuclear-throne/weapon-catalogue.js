const rows=`
revolver|REVOLVER|sprRevolver
triple-machinegun|TRIPLE MACHINEGUN|sprTripleMachinegun
wrench|WRENCH|sprWrench
machinegun|MACHINEGUN|sprMachinegun
shotgun|SHOTGUN|sprShotgun
crossbow|CROSSBOW|sprCrossbow
grenade|GRENADE LAUNCHER|sprGrenade
double-shotgun|DOUBLE SHOTGUN|sprShotgun
minigun|MINIGUN|sprMinigun
auto-shotgun|AUTO SHOTGUN|sprAutoShotgun
auto-crossbow|AUTO CROSSBOW|sprAutoCrossbow
super-crossbow|SUPER CROSSBOW|sprSuperCrossbow
shovel|SHOVEL|sprShovel
bazooka|BAZOOKA|sprBazooka
sticky-launcher|STICKY LAUNCHER|sprStickyGrenade
smg|SMG|sprSmg
assault-rifle|ASSAULT RIFLE|sprARifle
disc-gun|DISC GUN|sprDiscGun
laser-pistol|LASER PISTOL|sprLaserGun
laser-rifle|LASER RIFLE|sprLaserRifle
slugger|SLUGGER|sprShotgun
gatling-slugger|GATLING SLUGGER|sprGatlingSlugger
assault-slugger|ASSAULT SLUGGER|sprAssaultSlugger
energy-sword|ENERGY SWORD|sprEnergySword
super-slugger|SUPER SLUGGER|sprSuperSlugger
hyper-rifle|HYPER RIFLE|sprHyperRifle
screwdriver|SCREWDRIVER|sprScrewDriver
laser-minigun|LASER MINIGUN|sprLaserMinigun
blood-launcher|BLOOD LAUNCHER|sprBloodNader
splinter-gun|SPLINTER GUN|sprSplinterGun
toxic-bow|TOXIC BOW|sprToxicBow
sentry-gun|SENTRY GUN|sprMachinegun
wave-gun|WAVE GUN|sprLaserGun
plasma-gun|PLASMA GUN|sprPlasmaGun
plasma-cannon|PLASMA CANNON|sprPlasmaCannon
energy-hammer|ENERGY HAMMER|sprEnergyHammer
jackhammer|JACKHAMMER|sprJackHammer
flak-cannon|FLAK CANNON|sprFlakCannon
gold-revolver|GOLDEN REVOLVER|sprGoldRevolver
gold-wrench|GOLDEN WRENCH|sprGoldWrench
gold-machinegun|GOLDEN MACHINEGUN|sprGoldMachinegun
gold-shotgun|GOLDEN SHOTGUN|sprGoldShotgun
gold-crossbow|GOLDEN CROSSBOW|sprGoldCrossbow
gold-grenade|GOLDEN GRENADE LAUNCHER|sprGoldNader
gold-laser-pistol|GOLDEN LASER PISTOL|sprGoldLaserGun
chicken-sword|CHICKEN SWORD|sprSword
nuke-launcher|NUKE LAUNCHER|sprNukeLauncher
ion-cannon|ION CANNON|sprIonCannon
quad-machinegun|QUADRUPLE MACHINEGUN|sprQuadrupleMachinegun
flamethrower|FLAMETHROWER|sprFlameThrower
dragon|DRAGON|sprFlameThrower
flare-gun|FLARE GUN|sprFireBall
energy-screwdriver|ENERGY SCREWDRIVER|sprEnergyScrewDriver
hyper-launcher|HYPER LAUNCHER|sprHyperLauncher
laser-cannon|LASER CANNON|sprLaserCannon
rusty-revolver|RUSTY REVOLVER|sprRustyRevolver
lightning-pistol|LIGHTNING PISTOL|sprLightningPistol
lightning-rifle|LIGHTNING RIFLE|sprLightningRifle
lightning-shotgun|LIGHTNING SHOTGUN|sprLightningShotgun
super-flak|SUPER FLAK CANNON|sprSuperFlakCannon
sawed-off|SAWED-OFF SHOTGUN|sprSawnOffShotgun
splinter-pistol|SPLINTER PISTOL|sprSplinterPistol
super-splinter|SUPER SPLINTER GUN|sprHeavySplinterGun
lightning-smg|LIGHTNING SMG|sprLightningSMG
smart-gun|SMART GUN|sprSeekerPistol
heavy-crossbow|HEAVY CROSSBOW|sprHeavyCrossbow
blood-hammer|BLOOD HAMMER|sprBloodHammer
lightning-cannon|LIGHTNING CANNON|sprLightningCannon
pop-gun|POP GUN|sprPopRifle
plasma-rifle|PLASMA RIFLE|sprPlasmaRifle
pop-rifle|POP RIFLE|sprPopRifle
toxic-launcher|TOXIC LAUNCHER|sprToxicNader
flame-cannon|FLAME CANNON|sprFlameCannon
lightning-hammer|LIGHTNING HAMMER|sprLightningHammer
flame-shotgun|FLAME SHOTGUN|sprFlameShotgun
double-flame-shotgun|DOUBLE FLAME SHOTGUN|sprDoubleFlameShotgun
auto-flame-shotgun|AUTO FLAME SHOTGUN|sprAutoFlameShotgun
cluster-launcher|CLUSTER LAUNCHER|sprClusterGrenadeBlink
grenade-shotgun|GRENADE SHOTGUN|sprNadeShotgun
grenade-rifle|GRENADE RIFLE|sprNadeRifle
rogue-rifle|ROGUE RIFLE|sprRogueRifle
party-gun|PARTY GUN|sprMachinegun
double-minigun|DOUBLE MINIGUN|sprDoubleMinigun
gatling-bazooka|GATLING BAZOOKA|sprGatlingBazooka
auto-grenade-shotgun|AUTO GRENADE SHOTGUN|sprAutoNadeShotgun
ultra-revolver|ULTRA REVOLVER|sprUltraRevolver
ultra-laser-pistol|ULTRA LASER PISTOL|sprUltraLaserGun
sledgehammer|SLEDGEHAMMER|sprHammer
heavy-revolver|HEAVY REVOLVER|sprHeavyRevolver
heavy-machinegun|HEAVY MACHINEGUN|sprHeavyMachinegun
heavy-slugger|HEAVY SLUGGER|sprSuperSlugger
ultra-shovel|ULTRA SHOVEL|sprUltraShovel
ultra-shotgun|ULTRA SHOTGUN|sprUltraShotgun
ultra-crossbow|ULTRA CROSSBOW|sprUltraCrossbow
ultra-grenade|ULTRA GRENADE LAUNCHER|sprUltraNader
plasma-minigun|PLASMA MINIGUN|sprPlasmaMinigun
devastator|DEVASTATOR|sprDevastator
gold-plasma|GOLDEN PLASMA GUN|sprGoldPlasmaGun
gold-slugger|GOLDEN SLUGGER|sprGoldSlugger
gold-splinter|GOLDEN SPLINTER GUN|sprGoldSplinterGun
gold-screwdriver|GOLDEN SCREWDRIVER|sprGoldScrewdriver
gold-bazooka|GOLDEN BAZOOKA|sprGoldBazooka
gold-assault-rifle|GOLDEN ASSAULT RIFLE|sprGoldARifle
super-disc|SUPER DISC GUN|sprSuperDiscGun
heavy-auto-crossbow|HEAVY AUTO CROSSBOW|sprHeavyAutoCrossbow
heavy-assault-rifle|HEAVY ASSAULT RIFLE|sprHeavyARifle
blood-cannon|BLOOD CANNON|sprBloodCannon
incinerator|INCINERATOR|sprFlameCannon
super-plasma-cannon|SUPER PLASMA CANNON|sprSuperPlasmaCannon
seeker-pistol|SEEKER PISTOL|sprSeekerPistol
seeker-shotgun|SEEKER SHOTGUN|sprSeekerShotgun
eraser|ERASER|sprEraser
guitar|GUITAR|sprGuitar
bouncer-smg|BOUNCER SMG|sprBouncerSMG
bouncer-shotgun|BOUNCER SHOTGUN|sprBouncerShotgun
hyper-slugger|HYPER SLUGGER|sprHyperSlugger
super-bazooka|SUPER BAZOOKA|sprSuperBazooka
frog-pistol|FROG PISTOL|sprRevolver
black-sword|BLACK SWORD|sprBlackSword
gold-nuke|GOLDEN NUKE LAUNCHER|sprGoldNukeLauncher
gold-disc|GOLDEN DISC GUN|sprGoldDiscgun
heavy-grenade|HEAVY GRENADE LAUNCHER|sprHeavyGrenadeBlink
gun-gun|GUN GUN|sprMachinegun
eggplant|EGGPLANT|sprEggplant
gold-frog-pistol|GOLDEN FROG PISTOL|sprGoldFrogBlaster`.trim().split('\n').map(row=>row.split('|'));

const melee=/wrench|shovel|sword|screwdriver|hammer|jackhammer|guitar|eggplant/;
function build([id,name,sprite]){
  const lower=name.toLowerCase(),isMelee=melee.test(lower),energy=/laser|plasma|lightning|energy|flame|incinerator|dragon/.test(lower);
  const ammo=isMelee?null:energy?'energy':/crossbow|splinter|toxic bow/.test(lower)?'bolts':/shotgun|slugger|flak|eraser|devastator/.test(lower)?'shells':/launcher|bazooka|grenade|nuke|disc|cannon|party gun/.test(lower)?'explosives':'bullets';
  let shots=/quadruple/.test(lower)?4:/triple/.test(lower)?3:/double/.test(lower)?2:1;if(/shotgun/.test(lower))shots*=/super|ultra|seeker|bouncer/.test(lower)?12:6;if(/super crossbow/.test(lower))shots=5;if(/ultra crossbow/.test(lower))shots=7;
  const cooldown=isMelee?.42:/minigun|smg|hyper rifle|auto/.test(lower)?.075:/machinegun|assault|rifle/.test(lower)?.16:/shotgun|crossbow|launcher|bazooka|cannon|slugger/.test(lower)?.62:.28;
  const damage=isMelee?(/hammer|shovel|guitar|sword/.test(lower)?12:7):/nuke/.test(lower)?38:/bazooka|launcher|grenade/.test(lower)?18:/plasma cannon|lightning cannon/.test(lower)?22:/crossbow|slugger/.test(lower)?10:/shotgun/.test(lower)?2:/heavy/.test(lower)?6:energy?4:3;
  const cost=isMelee?0:/super|ultra|heavy|nuke|cannon/.test(lower)?2:1;
  return {name,ammo,cost,cooldown,speed:isMelee?115:/grenade|launcher|bazooka|nuke/.test(lower)?130:/plasma/.test(lower)?175:/crossbow|splinter/.test(lower)?325:245,damage,spread:/shotgun/.test(lower)?.42:/machinegun|minigun|smg/.test(lower)?.16:.04,shots,sprite,pierce:/crossbow|splinter|plasma|eraser/.test(lower)?2:0,life:isMelee?.16:1.5,radius:isMelee?9:/plasma|nuke/.test(lower)?5:2,melee:isMelee,explosive:/launcher|bazooka|grenade|nuke/.test(lower),homing:/seeker|smart gun/.test(lower),bounce:/disc|bouncer/.test(lower)?3:0,lightning:/lightning/.test(lower),flame:/flame|incinerator|dragon/.test(lower),blood:/blood/.test(lower)};
}
export const WEAPONS=Object.fromEntries(rows.map(row=>[row[0],build(row)]));
export const WEAPON_IDS=Object.keys(WEAPONS);
