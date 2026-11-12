// Decode only the texture and level formats used by the supported Duck Game
// installation. All input and generated assets stay in the selecting browser.
const TEXTURES = `duck duckArms pistol shotgun ak47 bazooka mainBackground
cityBackground industrialBackground natureBackground officeBackground spaceBackground snowBackground undergroundBackground
caveTileset cityTileset cityTreeTileset industrialTileset natureTileset nublessSnowTileset officeTileset
pineTreeSnowTileset pineTreeTileset pineTrunkTileset scaffoldingTileset snowIceTileset snowTileset spaceTileset
spookyTileset treeTileset undergroundTileset wireTileset woodScaffoldingTileset
crate itemBox itemBoxRandom spring spikes mine teleporterTop teleporterBottom teleporterIcon
door verticalDoor travelPipes travelPipesBlue travelPipesGreen window streetLight hangingCityLight treeTop rock01 desk
pickup_banana pickup_blunderbuss pickup_bootsPickup pickup_camping pickup_chaingun pickup_chestPlatePickup
pickup_combatShotgun pickup_dartgun pickup_deathcrate pickup_cowboyPistol pickup_extinguisher pickup_flamethrower
pickup_flareGun pickup_grenade pickup_grenadecannon pickup_grenadeLauncher pickup_helmetPickup pickup_holster
pickup_hugeLaser pickup_jetpack pickup_key pickup_knightHelmetPickup pickup_laserRifle pickup_magnum pickup_magnetGun
pickup_mindControlGun pickup_musket pickup_netGun pickup_oldPistol pickup_pelletGun pickup_pewpewLaser pickup_quadLaser
pickup_sledgeHammer pickup_sniper pickup_virtualShotgun pickup_warpgun pickup_present`.split(/\s+/);
const ALIASES = Object.freeze({ snowBackground: 'background/snowSky', undergroundBackground: 'background/underground',
  cityTreeTileset: 'cityTree', nublessSnowTileset: 'nublessSnow', officeTileset: 'officeTileset2',
  pineTreeSnowTileset: 'pineTilesetSnow', pineTreeTileset: 'pineTileset', pineTrunkTileset: 'pineTreeTileset',
  scaffoldingTileset: 'scaffolding', woodScaffoldingTileset: 'woodScaffolding', pickup_present: 'ctf/present' });
const SOUNDS = `pistolFire shotgunFire2 deepMachineGun2 missile grenadeFire sniper magnum swordClash netGunFire
flameExplode explode jump respawn death crateDestroy scoreDing click`.split(/\s+/);
const MAX_FILE = 32 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const fail = (message) => { throw new Error(`Duck Game import: ${message}`); };

class Reader {
  constructor(bytes, start = 0, end = bytes.length) { this.b = bytes; this.p = start; this.end = end; this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  need(n) { if (!Number.isSafeInteger(n) || n < 0 || this.p + n > this.end) fail('truncated or invalid binary length'); }
  u8() { this.need(1); return this.b[this.p++]; }
  u16() { this.need(2); const n = this.v.getUint16(this.p, true); this.p += 2; return n; }
  u32() { this.need(4); const n = this.v.getUint32(this.p, true); this.p += 4; return n; }
  i32() { this.need(4); const n = this.v.getInt32(this.p, true); this.p += 4; return n; }
  f32() { this.need(4); const n = this.v.getFloat32(this.p, true); this.p += 4; if (!Number.isFinite(n)) fail('non-finite level value'); return n; }
  take(n) { this.need(n); const bytes = this.b.subarray(this.p, this.p + n); this.p += n; return bytes; }
  sub(n) { this.need(n); const r = new Reader(this.b, this.p, this.p + n); this.p += n; return r; }
  string() { let n = this.u16(); if (n === 65535) fail('unsupported oversized level string'); return utf8.decode(this.take(n)); }
  varint() { let n = 0; for (let i = 0; i < 5; i++) { const b = this.u8(); n += (b & 127) * 2 ** (i * 7); if (!(b & 128)) return n; } fail('invalid XNB integer'); }
  done() { if (this.p !== this.end) fail('unsupported trailing binary data'); }
}

export function decodeDuckTexture(buffer) {
  const b = new Uint8Array(buffer); if (b.length > MAX_FILE) fail('texture exceeds size limit');
  const r = new Reader(b);
  if (utf8.decode(r.take(3)) !== 'XNB' || r.u8() !== 119 || r.u8() !== 5 || r.u8() !== 0) fail('requires uncompressed Windows XNB version 5 textures');
  if (r.u32() !== b.length) fail('invalid XNB file size');
  const count = r.varint(); if (count < 1 || count > 16) fail('invalid texture reader count');
  const readers = [];
  for (let i = 0; i < count; i++) { const length = r.varint(); if (length > 1024) fail('oversized XNB reader name'); readers.push(utf8.decode(r.take(length))); if (r.u32() !== 0) fail('unsupported XNB reader version'); }
  if (r.varint() !== 0) fail('unsupported shared XNB resources');
  const type = r.varint();
  if (!readers[type - 1]?.startsWith('Microsoft.Xna.Framework.Content.Texture2DReader,')) fail('not an XNB texture');
  const format = r.u32(), width = r.u32(), height = r.u32(), mips = r.u32();
  if (format !== 0 || !width || !height || width > 4096 || height > 4096 || width * height > 4 * 1024 * 1024 || mips !== 1) fail('unsupported texture format, dimensions or mip count');
  if (r.u32() !== width * height * 4) fail('invalid RGBA texture length');
  const rgba = r.take(width * height * 4); r.done(); return { width, height, rgba };
}

// PNG encoding uses browser compression, allowing conversion without uploading
// files or executing a game binary. Scanlines and output are strictly bounded.
const crcTable = new Uint32Array(256).map((_, i) => { let n = i; for (let j = 0; j < 8; j++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n; });
function pngChunk(name, data) {
  const out = new Uint8Array(data.length + 12), v = new DataView(out.buffer);
  v.setUint32(0, data.length); out.set(new TextEncoder().encode(name), 4); out.set(data, 8);
  let crc = 0xffffffff; for (let i = 4; i < out.length - 4; i++) crc = crcTable[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  v.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0); return out;
}
async function png(texture) {
  const { width, height, rgba } = texture, header = new Uint8Array(13), h = new DataView(header.buffer);
  h.setUint32(0, width); h.setUint32(4, height); header[8] = 8; header[9] = 6;
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  if (typeof CompressionStream !== 'function') fail('this browser needs CompressionStream support');
  const compressed = new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', compressed), pngChunk('IEND', new Uint8Array())], { type: 'image/png' });
}

function chunk(r, depth = 0) {
  if (depth > 8) fail('level nesting exceeds limit');
  const version = r.u16(); if (version > 2) fail('unsupported level chunk version');
  const body = r.sub(r.u32()); const count = body.u16(); if (count > 512) fail('too many level properties');
  const fields = new Map();
  for (let i = 0; i < count; i++) {
    const name = body.string(); if (name.length > 256) fail('oversized level property');
    let tag = null, className = null;
    if (name.startsWith('@')) { tag = body.u8(); if (tag === 255) { fields.set(name, { tag, value: null }); continue; } if (!(tag & 1)) className = body.string(); }
    const value = body.sub(body.u32()); fields.set(name, { tag, className, value });
  }
  body.done(); return fields;
}
function primitive(field) {
  if (field.tag === 255) return null;
  const r = field.value, id = field.tag >> 1; let value;
  if (id === 1) value = r.i32();
  else if (id === 2) value = r.u32();
  else if (id === 3 || id === 4) { value = r.u16(); if (id === 3 && value >= 32768) value -= 65536; }
  else if (id === 5 || id === 6) { value = r.u8(); if (id === 5 && value >= 128) value -= 256; }
  else if (id === 8) value = r.f32();
  else if (id === 11) value = r.string();
  else if (id === 12) { value = r.u8(); if (value > 1) fail('invalid boolean'); value = !!value; }
  else if (field.className === 'DuckGame.BitBuffer, DuckGame') { let length = r.u16(); if (length === 65535) length = r.u32(); value = r.take(length); }
  else fail('unsupported level property type');
  r.done(); return value;
}
function tileRows(bytes, type, ct20, autoBlock, version) {
  const r = new Reader(bytes), n = r.u32(); if (n > 20000) fail('too many map tiles');
  const rows = [];
  for (let i = 0; i < n; i++) {
    let x = r.f32(), literal255 = false;
    if (!autoBlock && ct20 && x < -99999) { x = r.f32(); literal255 = true; }
    const y = r.f32(); let frame = r.u8(), flipHorizontal = false;
    if (frame === 255 && (version === 2 || (!autoBlock && ct20))) { flipHorizontal = true; frame = r.u8(); }
    if (literal255) frame = 255;
    if (Math.abs(x) > 100000 || Math.abs(y) > 100000) fail('invalid map coordinates');
    if (autoBlock) r.take(8);
    rows.push({ type, x, y, frame, flipHorizontal });
  }
  r.done(); return rows;
}
export function decodeDuckLevel(buffer, source = 'local.lev') {
  const b = new Uint8Array(buffer); if (b.length > 2 * 1024 * 1024) fail('level exceeds size limit');
  const r = new Reader(b); r.need(8);
  if (r.v.getBigUint64(r.p, true) !== 5033950674723417n) fail('unsupported level signature'); r.p += 8;
  r.u32(); // Stored game checksum is not a security/authenticity guarantee.
  const version = r.u16(); if (version !== 1 && version !== 2) fail('requires version 1 or 2 Duck Game levels');
  if (version === 2) {
    const extra = r.u8(); if (extra > 1) fail('invalid metadata flag');
    if (extra) { r.string(); chunk(r); }
  }
  // Root has already consumed its version; expose its length/body as a chunk.
  const rootStart = r.p;
  const rootBytes = new Uint8Array(b.length - rootStart + 2); rootBytes[0] = version; rootBytes.set(b.subarray(rootStart), 2);
  const rootReader = new Reader(rootBytes), root = chunk(rootReader); rootReader.done();
  const holder = root.get('objects'); if (!holder) fail('level has no object container');
  const container = chunk(holder.value); holder.value.done();
  const array = container.get('objects')?.value; if (!array) fail('level has no object array');
  const n = array.u32(); if (n > 4096) fail('too many level objects');
  const objects = [], things = [], thingCounts = Object.create(null);
  for (let i = 0; i < n; i++) {
    const present = array.u8(); if (!present) continue; if (present !== 1) fail('invalid object presence flag');
    const fields = chunk(array), object = Object.create(null);
    for (const [name, field] of fields) if (name.startsWith('@')) { const key = name.slice(1); if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('invalid object property'); object[key] = primitive(field); }
    if (typeof object.type !== 'string' || object.type.length > 256) fail('invalid object class');
    if (object.type.split(',')[0] === 'DuckGame.ThingContainer') {
      if (typeof object.blockType !== 'string' || !(object.data instanceof Uint8Array)) fail('invalid tile container');
      const candidates = [];
      for (const auto of [false, true]) { try { candidates.push(tileRows(object.data, object.blockType, !!object.ct20, auto, version)); } catch { /* Try both documented tile record layouts. */ } }
      if (!candidates.length || (candidates.length > 1 && candidates[0].length)) fail('unsupported or ambiguous tile layout');
      if (things.length + candidates[0].length > 20000) fail('too many map tiles');
      for (const tile of candidates[0]) { things.push(tile); thingCounts[tile.type] = (thingCounts[tile.type] || 0) + 1; }
    } else {
      delete object.data; delete object.groupData;
      for (const [key, value] of Object.entries(object)) if (value instanceof Uint8Array) delete object[key];
      objects.push(object);
    }
  }
  array.done(); if (!things.length || things.length > 20000) fail('map has no supported tiles or exceeds limit');
  return { schema: 'duck-game-level-v1', source, rootChunks: root.size, objects, things, thingCounts };
}

export async function importDuck(files, outputMap) {
  if (!(outputMap instanceof Map)) fail('output must be a Map');
  if (!files?.length || files.length > 30000) fail('select a Duck Game or Content folder with at most 30,000 files');
  const content = new Map();
  for (const file of files) {
    const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/').toLowerCase();
    const parts = path.split('/'); if (parts.some(x => x === '..' || x === '.')) fail('invalid selected path');
    const at = parts.lastIndexOf('content'); if (at < 0) continue;
    const relative = parts.slice(at + 1).join('/'); if (!relative) continue;
    if (content.has(relative)) fail(`ambiguous selected file: ${relative}`); content.set(relative, file);
  }
  if (!content.size) fail('select the installed Duck Game folder or its Content folder');
  let bytesRead = 0;
  const read = async (file, limit = MAX_FILE) => {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit || (bytesRead += file.size) > MAX_TOTAL) fail('selected assets exceed import limits');
    const data = await file.arrayBuffer(); if (data.byteLength !== file.size) fail('selected file changed during import'); return data;
  };
  const pending = new Map();
  for (const name of TEXTURES) {
    const path = `${ALIASES[name] || name.replace(/^pickup_/, '')}.xnb`.toLowerCase();
    const file = content.get(path); if (!file) fail(`missing Content/${path}`);
    pending.set(`assets/${name}.png`, await png(decodeDuckTexture(await read(file))));
  }
  for (const name of SOUNDS) {
    const path = `audio/sfx/${name}.wav`.toLowerCase(), file = content.get(path); if (!file) fail(`missing Content/${path}`);
    const data = new Uint8Array(await read(file, 8 * 1024 * 1024));
    if (data.length < 12 || utf8.decode(data.subarray(0, 4)) !== 'RIFF' || utf8.decode(data.subarray(8, 12)) !== 'WAVE') fail(`invalid WAV: ${name}`);
    pending.set(`assets/Audio/SFX/${name}.wav`, new Blob([data], { type: 'audio/wav' }));
  }
  const maps = [], skippedMaps = [];
  const levels = [...content].filter(([path]) => /^levels\/deathmatch\/[a-z0-9_-]+\.lev$/.test(path)).sort(([a], [b]) => a.localeCompare(b));
  if (levels.length > 512) fail('too many deathmatch levels');
  for (const [path, file] of levels) {
    const name = path.split('/').pop().slice(0, -4), output = `deathmatch-${name}.json`;
    const data = await read(file, 2 * 1024 * 1024);
    try {
      const level = decodeDuckLevel(data, path.slice(7));
      pending.set(`levels/${output}`, new Blob([JSON.stringify(level)], { type: 'application/json' }));
      maps.push({ name, source: path.slice(7), path: output });
    } catch (error) { skippedMaps.push({ name, reason: error.message }); }
  }
  if (!maps.length) fail('no supported deathmatch levels found');
  pending.set('levels/index.json', new Blob([JSON.stringify({ schema: 'duck-game-level-index-v1', maps })], { type: 'application/json' }));
  const outputBytes = [...pending.values()].reduce((sum, file) => sum + file.size, 0); if (outputBytes > MAX_TOTAL) fail('converted assets exceed size limit');
  for (const [path, file] of pending) outputMap.set(path, file);
  return { textures: TEXTURES.length, sounds: SOUNDS.length, maps: maps.length, skippedMaps, bytes: outputBytes };
}
