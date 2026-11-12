using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using UndertaleModLib.Util;

EnsureDataLoaded();

string root = Environment.GetEnvironmentVariable("MATRIXGAMES_ASSET_OUTPUT");
if (String.IsNullOrWhiteSpace(root)) throw new Exception("Choose an output directory with the importer.");
string output = Path.Combine(root, "assets", "sprites");
Directory.CreateDirectory(output);

var wanted = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "sprFishA", "sprFishBoost", "sprMutant1Idle", "sprMutant1Walk", "sprMutant1Hurt", "sprMutant1Dead",
    "sprBanditIdle", "sprBanditWalk", "sprBanditGun", "sprBanditHurt", "sprBanditDead",
    "sprBanditBossIdle", "sprBanditBossWalk", "sprBanditBossTell", "sprBanditBossDash",
    "sprBanditBossFire", "sprBanditBossHurt", "sprBanditBossDead",
    "sprMaggotIdle", "sprMaggotHurt", "sprMaggotDead",
    "sprScorpionIdle", "sprScorpionWalk", "sprScorpionFire", "sprScorpionHurt", "sprScorpionDead",
    "sprBullet1", "sprBulletHit", "sprEnemyBullet1", "sprEnemyBulletHit",
    "sprGrenade", "sprGrenadeBlink", "sprExplosion",
    "sprRevolver", "sprShotgun", "sprSmg", "sprCrossbow",
    "sprFloor0", "sprWall0Top", "sprWall0Bot", "sprDesertTopDecal",
    "sprPortal", "sprPortalSpawn", "sprPortalDisappear", "sprPortalShock",
    "sprAmmo", "sprRad", "sprHealthBar", "sprHealthFill", "sprWeaponChest", "sprWeaponChestOpen"
};
foreach (string name in new [] {"sprARifle","sprAssaultSlugger","sprAutoCrossbow","sprAutoFlameShotgun","sprAutoNadeShotgun","sprAutoShotgun","sprBazooka","sprBlackSword","sprBloodCannon","sprBloodHammer","sprBloodNader","sprBouncerSMG","sprBouncerShotgun","sprClusterGrenadeBlink","sprCrossbow","sprDevastator","sprDiscGun","sprDoubleFlameShotgun","sprDoubleMinigun","sprEggplant","sprEnergyHammer","sprEnergyScrewDriver","sprEnergySword","sprEraser","sprFireBall","sprFlakCannon","sprFlameCannon","sprFlameShotgun","sprFlameThrower","sprGatlingBazooka","sprGatlingSlugger","sprGoldARifle","sprGoldBazooka","sprGoldCrossbow","sprGoldDiscgun","sprGoldFrogBlaster","sprGoldLaserGun","sprGoldMachinegun","sprGoldNader","sprGoldNukeLauncher","sprGoldPlasmaGun","sprGoldRevolver","sprGoldScrewdriver","sprGoldShotgun","sprGoldSlugger","sprGoldSplinterGun","sprGoldWrench","sprGrenade","sprGuitar","sprHammer","sprHeavyARifle","sprHeavyAutoCrossbow","sprHeavyCrossbow","sprHeavyGrenadeBlink","sprHeavyMachinegun","sprHeavyRevolver","sprHeavySplinterGun","sprHyperLauncher","sprHyperRifle","sprHyperSlugger","sprIonCannon","sprJackHammer","sprLaserCannon","sprLaserGun","sprLaserMinigun","sprLaserRifle","sprLightningCannon","sprLightningHammer","sprLightningPistol","sprLightningRifle","sprLightningSMG","sprLightningShotgun","sprMachinegun","sprMinigun","sprNadeRifle","sprNadeShotgun","sprNukeLauncher","sprPlasmaCannon","sprPlasmaGun","sprPlasmaMinigun","sprPlasmaRifle","sprPopRifle","sprQuadrupleMachinegun","sprRevolver","sprRogueRifle","sprRustyRevolver","sprSawnOffShotgun","sprScrewDriver","sprSeekerPistol","sprSeekerShotgun","sprShotgun","sprShovel","sprSmg","sprSplinterGun","sprSplinterPistol","sprStickyGrenade","sprSuperBazooka","sprSuperCrossbow","sprSuperDiscGun","sprSuperFlakCannon","sprSuperPlasmaCannon","sprSuperSlugger","sprSword","sprToxicBow","sprToxicNader","sprTripleMachinegun","sprUltraCrossbow","sprUltraLaserGun","sprUltraNader","sprUltraRevolver","sprUltraShotgun","sprUltraShovel","sprWrench","spread","sprite"}) wanted.Add(name);
var exported = new List<object>();
using (var worker = new TextureWorker())
{
    foreach (var sprite in Data.Sprites.Where(sprite => wanted.Contains(sprite.Name.Content)))
    {
        var frames = new List<string>();
        for (int index = 0; index < sprite.Textures.Count; index++)
        {
            var pageItem = sprite.Textures[index]?.Texture;
            if (pageItem is null) continue;
            string fileName = $"{sprite.Name.Content}_{index}.png";
            worker.ExportAsPNG(pageItem, Path.Combine(output, fileName), null, false);
            frames.Add(fileName);
        }
        exported.Add(new
        {
            name = sprite.Name.Content,
            width = sprite.Width,
            height = sprite.Height,
            originX = sprite.OriginX,
            originY = sprite.OriginY,
            frames
        });
    }
}

File.WriteAllText(Path.Combine(output, "manifest.json"), JsonSerializer.Serialize(exported, new JsonSerializerOptions { WriteIndented = true }));
ScriptMessage($"Exported {exported.Count} selected sprite sets.");

string audioOutput = Path.Combine(root, "assets", "audio");
Directory.CreateDirectory(audioOutput);
var soundNames = new HashSet<string> { "sndPistol", "sndShotgun", "sndSMG", "sndCrossbow", "sndGrenadeLauncher", "sndRadPickup", "sndAmmoPickup", "sndHPPickup", "sndPortalOpen", "sndLevelUp", "sndMutant1Hurt", "sndBanditDie", "sndBigBanditIntro", "sndScorpionFire" };
foreach (var sound in Data.Sounds.Where(sound => sound != null && soundNames.Contains(sound.Name.Content))) {
 if (sound.AudioFile == null) continue;
 string ext = sound.Flags.HasFlag(UndertaleModLib.Models.UndertaleSound.AudioEntryFlags.IsCompressed) ? ".ogg" : ".wav";
 File.WriteAllBytes(Path.Combine(audioOutput, sound.Name.Content + ext), sound.AudioFile.Data);
}
