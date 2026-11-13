import test from 'node:test';import assert from 'node:assert/strict';
import {nativeLaunchUrl,NativeLaunchLinks} from '../client/native-launch.js';
test('direct-launch URI carries only a bounded single-use capability',()=>{
 const grant={schema:2,room:'nohesi-110',authorization:'a'.repeat(43),expiresAt:91000,host:'untrusted.invalid'};
 assert.equal(nativeLaunchUrl(grant,1000),'matrixgames://join?authorization='+'a'.repeat(43));
 for(const bad of [{authorization:'a&host=evil'}, {expiresAt:1000},{expiresAt:999999},{room:'unknown'},{schema:1}])assert.throws(()=>nativeLaunchUrl({...grant,...bad},1000));
});
test('repeat clicks reuse the pending grant; expiration and account changes request fresh grants',async()=>{
 let now=1000,calls=0;const links=new NativeLaunchLinks(async room=>{calls++;return {schema:2,room,authorization:'a'.repeat(43),expiresAt:now+90000};},()=>now);
 await Promise.all([links.get('nohesi-110','one'),links.get('nohesi-110','one')]);assert.equal(calls,1);
 await links.get('nohesi-110','one');assert.equal(calls,1);await links.get('nohesi-110','two');assert.equal(calls,2);
 now+=90001;await links.get('nohesi-110','one');assert.equal(calls,3);
});
