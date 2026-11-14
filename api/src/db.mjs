import pg from 'pg';
import {readFile} from 'node:fs/promises';
export const connect=url=>new pg.Pool({connectionString:url,max:5,connectionTimeoutMillis:5000,statement_timeout:10000});
export const one=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0];
export async function migrate(db){await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));}
export async function transaction(db,fn){const client=await db.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
export async function cleanup(db){await db.query('DELETE FROM launcher_devices WHERE expires_at<now()');await db.query('DELETE FROM launcher_sessions WHERE expires_at<now()');await db.query('DELETE FROM sessions WHERE expires_at<now()');await db.query('DELETE FROM oauth_states WHERE expires_at<now()');await db.query('DELETE FROM api_rate_limits WHERE expires_at<now()');}
