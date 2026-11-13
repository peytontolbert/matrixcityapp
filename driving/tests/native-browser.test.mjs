import test from 'node:test';
import assert from 'node:assert/strict';
import {raceConfig,prepareRace,restoreRace,atomicWrite,recentSteamId,raceSteamId,detectSteamId,STEAM_LAUNCH,MODEL} from '../client/native-browser.js';
const settings={schema:2,room:'nohesi-110',track:'nohesi_110',model:MODEL,host:'example.test',gamePort:9600,httpPort:8081,features:['STEAM_TICKET','CUSTOM_UPDATE']};
const identity={driver:'Driver',steamId:'76561198000000000',skin:'default'};
const grant=()=>({...settings,password:'mg1.test.'+'a'.repeat(43),expiresAt:Date.now()+90000});
class File{
 constructor(text=''){this.text=text;this.kind='file';}
 async getFile(){return {size:this.text.length,text:async()=>this.text};}
 async createWritable(){let next=this.text;return {write:async text=>{next=text;},close:async()=>{this.text=next;},abort:async()=>{}};}
}
class Folder{
 constructor(){this.children=new Map();this.kind='directory';}
 async getFileHandle(name,{create=false}={}){if(create&&!this.children.has(name))this.children.set(name,new File());if(!this.children.has(name))throw Object.assign(Error('Missing'),{name:'NotFoundError'});return this.children.get(name);}
 async getDirectoryHandle(name){if(!this.children.has(name))this.children.set(name,new Folder());return this.children.get(name);}
 async *entries(){yield ['default',new Folder()];}
}
function fixture(){const cfg=new Folder(),game=new Folder(),data=new Map();cfg.children.set('race.ini',new File('[HEADER]\nVERSION=2\n[RACE]\nTRACK=old\n[ASSISTS]\nAUTO_SHIFTER=1\n'));game.children.set('dwrite.dll',new File());return {setup:{cfg,game},key:'account:device',store:{get:async k=>data.get(k),set:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)},settings,identity,redeem:async()=>grant()};}
test('native browser config preserves assists and includes authentication/CSP settings',()=>{
 const text=raceConfig(grant(),identity,'[ASSISTS]\nAUTO_SHIFTER=1\n');assert.match(text,/AUTO_SHIFTER=1/);assert.match(text,/__CM_EXTENDED=1/);assert.match(text,/__FEATURES=STEAM_TICKET,CUSTOM_UPDATE/);assert.match(text,/SERVER_PORT=9600/);assert.match(text,/PASSWORD=mg1\./);assert.equal(STEAM_LAUNCH,'steam://run/244210//%2Fspawn/');
 for(const invalid of [{host:'example.test\n[REMOTE]'},{features:['STEAM_TICKET\r\n']},{track:'../bad'},{expiresAt:0},{password:'bad\r\n'},{gamePort:0}])assert.throws(()=>raceConfig({...grant(),...invalid},identity));
 assert.throws(()=>raceConfig(grant(),{...identity,driver:'Bad\n[REMOTE]'}));
});
test('preparation survives a reload, blocks overlap, and restores exact previous settings',async()=>{
 const f=fixture(),file=await f.setup.cfg.getFileHandle('race.ini'),original=file.text;
 const pending=await prepareRace(f);assert.equal((await f.setup.cfg.getFileHandle(pending.backup)).text,original);assert.match(file.text,/TRACK=nohesi_110/);
 await assert.rejects(prepareRace(f),/Restore/);await restoreRace({...f});assert.equal(file.text,original);assert.equal(await f.store.get(f.key+':pending'),undefined);
});
test('restoration refuses to overwrite changes made by Assetto or a changed backup',async()=>{
 const f=fixture(),pending=await prepareRace(f),file=await f.setup.cfg.getFileHandle('race.ini'),written=file.text;
 file.text='changed by game';await assert.rejects(restoreRace(f),/left untouched/);assert.equal(file.text,'changed by game');
 file.text=written;(await f.setup.cfg.getFileHandle(pending.backup)).text='changed backup';await assert.rejects(restoreRace(f),/backup changed/);assert.equal(file.text,written);
});
test('changed race during authorization and mismatched server never replace the original',async()=>{
 const f=fixture(),file=await f.setup.cfg.getFileHandle('race.ini');f.redeem=async()=>{file.text='new user settings';return grant();};await assert.rejects(prepareRace(f),/changed during preparation/);assert.equal(file.text,'new user settings');
 const g=fixture(),original=(await g.setup.cfg.getFileHandle('race.ini')).text;g.redeem=async()=>({...grant(),host:'different.test'});await assert.rejects(prepareRace(g),/Server configuration changed/);assert.equal((await g.setup.cfg.getFileHandle('race.ini')).text,original);
});
test('failed file commit aborts and leaves a durable recoverable pending record',async()=>{
 const f=fixture(),file=await f.setup.cfg.getFileHandle('race.ini'),original=file.text;let aborted=false;
 file.createWritable=async()=>({write:async()=>{throw Error('disk full');},close:async()=>{},abort:async()=>{aborted=true;}});
 await assert.rejects(prepareRace(f),/disk full/);assert.ok(aborted);assert.ok(await f.store.get(f.key+':pending'));assert.equal(file.text,original);await restoreRace(f);assert.equal(await f.store.get(f.key+':pending'),undefined);
});
test('local Steam lookup selects only most recent account and exports no other fields',()=>{
 assert.equal(recentSteamId('"users" { "76561198000000001" { "MostRecent" "0" } "76561198000000000" { "MostRecent" "1" "AccountName" "private" } }'),identity.steamId);assert.equal(recentSteamId('"76561198000000000" { "MostRecent" "0" }'),identity.steamId);
 assert.equal(recentSteamId('"76561198000000000" {} "76561198000000001" {}'),'');
 assert.equal(raceSteamId('[REMOTE]\nGUID='+identity.steamId+'\n[CAR_0]\n'),identity.steamId);assert.equal(raceSteamId('[CAR_0]\nGUID='+identity.steamId),'');
});
test('Steam ID lookup prefers current login metadata over a library last owner',async()=>{
 const root=new Folder(),config=await root.getDirectoryHandle('config'),apps=await root.getDirectoryHandle('steamapps');
 apps.children.set('appmanifest_244210.acf',new File('"LastOwner" "76561198000000001"'));assert.equal(await detectSteamId(root),'76561198000000001');
 config.children.set('loginusers.vdf',new File('"76561198000000000" {"MostRecent" "1"}'));assert.equal(await detectSteamId(root),identity.steamId);
});
