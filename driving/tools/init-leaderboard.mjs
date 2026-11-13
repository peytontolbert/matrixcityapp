// Run as the private driving service user, using an absolute durable data path.
import {isAbsolute} from 'node:path';
import {DrivingLeaderboard} from '../leaderboard.mjs';
const file=process.argv[2];
if(!file||!isAbsolute(file)||!file.endsWith('.sqlite'))throw Error('Provide an absolute .sqlite database path');
process.umask(0o077);
const board=new DrivingLeaderboard(file);
try{await board.load();const integrity=board.db.prepare('PRAGMA integrity_check').get().integrity_check;
 if(integrity!=='ok')throw Error('Leaderboard integrity check failed');
 console.log(JSON.stringify({storage:'sqlite',integrity,highscores:board.db.prepare('SELECT count(*) AS n FROM driving_highscores').get().n}));
}finally{await board.close();}
