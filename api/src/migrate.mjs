import {connect,migrate} from './db.mjs';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const db=connect(process.env.DATABASE_URL);try{await migrate(db);console.log('Account schema ready');}finally{await db.end();}
