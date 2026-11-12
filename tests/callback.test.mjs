import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {callbackTarget} from '../web/oauth-callback.js';
const state='x'.repeat(43);
test('callback forwards only bounded Google fields to the fixed VPS endpoint',()=>{
 const target=new URL(callbackTarget(new URLSearchParams({state,code:'one-time-code',target:'https://attacker.example.test',scope:'ignored'})));
 assert.equal(target.origin,'https://api.matrixgames.app');assert.equal(target.pathname,'/api/callback');assert.deepEqual([...target.searchParams.keys()],['state','code']);
 assert.equal(new URL(callbackTarget(new URLSearchParams({state,error:'access_denied'}))).searchParams.get('error'),'access_denied');
 for(const query of ['',`state=${state}`,`state=${state}&state=${state}&code=x`,`state=invalid&code=x`,`state=${state}&code=${'x'.repeat(4097)}`])assert.throws(()=>callbackTarget(query));
});
test('Azure callback is rewritten to the relay with no-store and no-referrer',async()=>{
 const config=JSON.parse(await readFile('staticwebapp.config.json','utf8'));
 const route=config.routes.find(r=>r.route==='/api/callback');assert.equal(route.rewrite,'/oauth-callback.html');assert.equal(route.headers['Cache-Control'],'no-store');assert.equal(route.headers['Referrer-Policy'],'no-referrer');assert.match(route.headers['Content-Security-Policy'],/default-src 'none'/);
});
