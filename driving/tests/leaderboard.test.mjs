import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DrivingLeaderboard,MAX_SCORE} from '../leaderboard.mjs';
import {CutUpScoring} from '../scoring.mjs';

const scratch=()=>mkdtemp(join(process.platform==='win32'?'K:/LANParty/tmp':process.env.TMPDIR||process.cwd(),'matrix-sqlite-'));
test('SQLite commits highscores before abrupt exit, preserves best per track/account and hides IDs',async()=>{
 const dir=await scratch(),file=join(dir,'leaderboard.sqlite');let board;
 try{
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {DrivingLeaderboard} from ${JSON.stringify(new URL('../leaderboard.mjs',import.meta.url).href)};
   const b=new DrivingLeaderboard(process.argv[1]);await b.load();b.record('nohesi-110','private-a',1200,4);process.exit(17);`,file],{encoding:'utf8'});
  assert.equal(child.status,17,child.stderr);board=new DrivingLeaderboard(file);await board.load();
  board.record('nohesi-110','private-a',500,2);board.record('nohesi-415','private-a',300,1);board.record('nohesi-110','private-b',1500,5);
  assert.deepEqual(board.top('nohesi-110').map(r=>[r.rank,r.score,r.passes]),[[1,1500,5],[2,1200,4]]);
  assert.equal(board.top('nohesi-415')[0].score,300);assert.ok(!JSON.stringify(board.top('nohesi-110')).includes('private-'));
  for(const value of [NaN,-1,1.5,MAX_SCORE+1])assert.throws(()=>board.record('nohesi-110','private-a',value,1));
  assert.throws(()=>board.record('other-room','private-a',1,1));
  assert.equal(board.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{await board?.close();await rm(dir,{recursive:true,force:true});}
});
test('legacy JSON imports once, survives stale writers, and remains intact',async()=>{
 const dir=await scratch(),legacy=join(dir,'leaderboard.json');let a,b;
 try{
  const data=JSON.stringify({schema:1,rows:[{room:'nohesi-110',actor:'legacy',best:900,passes:3,updatedAt:1}]});await writeFile(legacy,data);
  a=new DrivingLeaderboard(legacy);await a.load();b=new DrivingLeaderboard(legacy);await b.load();
  a.record('nohesi-110','legacy',2000,6);b.record('nohesi-110','legacy',1000,4);
  await a.close();a=new DrivingLeaderboard(legacy);await a.load();assert.equal(a.top('nohesi-110')[0].score,2000);assert.equal(await readFile(legacy,'utf8'),data);
 }finally{await a?.close();await b?.close();await rm(dir,{recursive:true,force:true});}
});
test('native and browser clean passes use the same scoring rules and durable leaderboard',async()=>{
 const dir=await scratch(),file=join(dir,'leaderboard.sqlite');let board;
 try{
  board=new DrivingLeaderboard(file);await board.load();const scoring=new CutUpScoring('nohesi-110',board);
  const traffic=[{id:'traffic:1',spawnGeneration:1,position:[40,2.5,0],velocity:[10,0,0],heading:0,width:1.8}];
  const drive=(actor,kind,coupled=true,collision=false)=>{let row;for(let i=0;i<65;i++)row=scoring.update(actor,{kind,coupled,position:[i,0,0],velocity:[30,0,0],heading:0},traffic,1000+i*1000/30,collision&&i===40);return row;};
  const native=drive('native','native'),browser=drive('browser','browser');assert.equal(native.passes,1);assert.equal(native.score,browser.score);
  assert.equal(drive('uncoupled','native',false).score,0);assert.equal(drive('collision','native',true,true).score,0);
  assert.equal(board.top('nohesi-110').length,2);await board.close();board=new DrivingLeaderboard(file);await board.load();assert.equal(board.top('nohesi-110')[0].score,native.score);
 }finally{await board?.close();await rm(dir,{recursive:true,force:true});}
});
