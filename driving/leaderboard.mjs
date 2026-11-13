import {createHash} from 'node:crypto';
import {mkdir,readFile,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';

const rooms=new Set(['nohesi-110','nohesi-415']);
export const MAX_SCORE=2147483647;
export const driverLabel=actor=>'Driver '+createHash('sha256').update(actor).digest('hex').slice(0,6).toUpperCase();
const valid=row=>rooms.has(row.room)&&typeof row.actor==='string'&&row.actor.length>0&&row.actor.length<=128
 &&Number.isSafeInteger(row.best)&&row.best>=0&&row.best<=MAX_SCORE&&Number.isSafeInteger(row.passes)&&row.passes>=0&&row.passes<=MAX_SCORE;

// SQLite stays on the private game service. No database or account IDs are sent
// to clients. Writes happen only on a new personal best, never on render ticks.
export class DrivingLeaderboard {
 constructor(file=null,{legacyFile}={}){this.file=file?.replace(/\.json$/,'.sqlite')??null;this.legacyFile=legacyFile??(this.file?this.file.replace(/\.sqlite$/,'.json'):null);this.rows=new Map();this.cache=new Map();this.db=null;}
 async load(){
  if(!this.file||this.db)return;
  await mkdir(dirname(this.file),{recursive:true,mode:0o700});
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(this.file);this.db=db;
  try{
   await chmod(this.file,0o600);
   db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS leaderboard_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS driving_highscores (
     room TEXT NOT NULL CHECK(room IN ('nohesi-110','nohesi-415')),
     actor TEXT NOT NULL CHECK(length(actor) BETWEEN 1 AND 128),
     best INTEGER NOT NULL CHECK(best BETWEEN 0 AND 2147483647),
     passes INTEGER NOT NULL CHECK(passes BETWEEN 0 AND 2147483647),
     updated_at INTEGER NOT NULL, PRIMARY KEY(room,actor)) STRICT;
    CREATE INDEX IF NOT EXISTS driving_highscores_rank ON driving_highscores(room,best DESC,updated_at,actor);`);
   this.upsert=db.prepare(`INSERT INTO driving_highscores(room,actor,best,passes,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(room,actor) DO UPDATE SET best=excluded.best,passes=excluded.passes,updated_at=excluded.updated_at
    WHERE excluded.best>driving_highscores.best`);
   if(!db.prepare("SELECT value FROM leaderboard_meta WHERE key='json_import_v1'").get()){
    let legacy=null;
    if(this.legacyFile&&this.legacyFile!==this.file)try{legacy=JSON.parse(await readFile(this.legacyFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(legacy&&(legacy.schema!==1||!Array.isArray(legacy.rows)||!legacy.rows.every(valid)))throw Error('Invalid legacy driving leaderboard');
    db.exec('BEGIN IMMEDIATE');
    try{for(const r of legacy?.rows??[])this.upsert.run(r.room,r.actor,r.best,r.passes,Number.isSafeInteger(r.updatedAt)?r.updatedAt:Date.now());
     db.prepare("INSERT INTO leaderboard_meta VALUES('json_import_v1','complete')").run();db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
   }
  }catch(e){db.close();this.db=null;throw e;}
 }
 record(room,actor,score,passes){
  const row={room,actor,best:score,passes,updatedAt:Date.now()};
  if(!valid(row))throw Error('Invalid authoritative highscore');
  if(this.file&&!this.db)throw Error('Leaderboard database is not open');
  if(this.db){if(!this.upsert.run(room,actor,score,passes,row.updatedAt).changes)return;}
  else{const key=room+':'+actor;if((this.rows.get(key)?.best??-1)>=score)return;this.rows.set(key,row);}
  this.cache.delete(room);
 }
 top(room){
  if(!this.cache.has(room)){
   const rows=this.db?this.db.prepare('SELECT actor,best,passes FROM driving_highscores WHERE room=? ORDER BY best DESC,updated_at,actor LIMIT 10').all(room)
    :[...this.rows.values()].filter(r=>r.room===room).sort((a,b)=>b.best-a.best||a.updatedAt-b.updatedAt||a.actor.localeCompare(b.actor)).slice(0,10);
   this.cache.set(room,rows.map((r,i)=>({rank:i+1,driver:driverLabel(r.actor),score:r.best,passes:r.passes})));
  }
  return this.cache.get(room).map(row=>({...row}));
 }
 // Every accepted personal best is already committed. Kept for shutdown callers.
 async save(){}
 async close(){this.db?.close();this.db=null;this.cache.clear();}
}
